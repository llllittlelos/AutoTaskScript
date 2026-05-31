"""
慈晓app自动阅读脚本
cron: 5 8 * * *
变量名: cixiao_ck
变量值格式: token#userId#deviceId
多账号分隔符: @
"""
import os
import sys
import time
import random
import hashlib
import string
import requests
import urllib3

# 修复Windows GBK编码问题
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if sys.stderr.encoding != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# 禁用SSL警告和代理
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
os.environ.pop('http_proxy', None)
os.environ.pop('https_proxy', None)
os.environ.pop('HTTP_PROXY', None)
os.environ.pop('HTTPS_PROXY', None)


class CiXiaoApp:
    """慈晓app用户类，模仿潇洒桐庐脚本结构"""

    # 签名盐值（通过Frida逆向确认）
    SIGN_SALT = "@#@$AXdm123%)(ds"
    STAMP_SUFFIX = "oz60508163059jgv"

    def __init__(self, index, ck_string):
        self.index = index
        self.ck_status = True
        self.art_list = []
        self.read_count = 0
        self.total_coin = 0

        # 解析ck：token#userId#deviceId
        parts = ck_string.split("#")
        self.token = parts[0] if len(parts) > 0 else ""
        self.user_id = parts[1] if len(parts) > 1 else ""
        self.device_id = parts[2] if len(parts) > 2 else ""

        # Native API请求头
        self.base_headers = {
            "Host": "cxapi.xiaodingkeji.com",
            "Connection": "Keep-Alive",
            "User-Agent": "okhttp/3.11.0",
            "accept-version": "200",
            "x-version": "730",
            "version": "7.23.0",
            "X-Token": self.token,
        }
        self.session = requests.Session()
        self.session.headers.update(self.base_headers)
        self.session.verify = False
        self.session.trust_env = False

        # H5 API请求头
        self.h5_headers = {
            "Host": "cxh5.xiaodingkeji.com",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Token": self.token,
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": (
                "Mozilla/5.0 (Linux; Android 13; Mi 10 Build/TKQ1.221114.001; wv) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/108.0.5359.128 "
                f"Mobile Safari/537.36 GdyBridgeWebView;xdinformation;"
                f"x-token:[{self.token}];x-userinfoId:[{self.user_id}];x-device:[{self.device_id}]"
            ),
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
            "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
            "Cookie": (
                f'headInfo=%7B%22x-token%22%3A%22{self.token}%22'
                f'%2C%22x-version%22%3A774%2C%22x-fontsize%22%3A%221%22%7D'
            ),
        }
        self.h5_session = requests.Session()
        self.h5_session.headers.update(self.h5_headers)
        self.h5_session.verify = False
        self.h5_session.trust_env = False

    def log(self, msg):
        print(f"【账号{self.index}】{msg}")

    def _gen_stamp(self):
        """生成stamp参数：13位毫秒时间戳 + 5位随机字符 + 固定后缀"""
        ts = str(int(time.time() * 1000))
        rand_str = ''.join(random.choices(string.ascii_lowercase + string.digits, k=5))
        return ts + rand_str + self.STAMP_SUFFIX

    def _calc_sign(self, stamp, api_path):
        """
        计算请求签名（已通过Frida逆向确认）
        算法: MD5(salt + stamp + apiPath)
        """
        sign_str = self.SIGN_SALT + stamp + api_path
        return hashlib.md5(sign_str.encode()).hexdigest()

    def _get(self, api_path, extra_params=None):
        """Native API通用GET请求"""
        url = f"https://cxapi.xiaodingkeji.com/{api_path}"
        stamp = self._gen_stamp()
        params = {"newspapergroupId": "15403", "stamp": stamp}
        if extra_params:
            params.update(extra_params)
        params["sign"] = self._calc_sign(stamp, api_path)
        return self.session.get(url, params=params, timeout=20)

    def _h5_get(self, api_path, extra_params=None, referer=None):
        """H5 API通用GET请求"""
        url = f"https://cxh5.xiaodingkeji.com/h5api/{api_path}"
        stamp = self._gen_stamp()
        params = {"json": "true", "stamp": stamp}
        if extra_params:
            params.update(extra_params)
        params["sign"] = self._calc_sign(stamp, api_path)
        headers = {}
        if referer:
            headers["Referer"] = referer
        return self.h5_session.get(url, params=params, headers=headers, timeout=20)

    # ==================== 主流程 ====================

    async def main(self):
        """主流程"""
        self.log(f"------开始{self.user_id}------")

        # 1. 验证token
        if not await self.get_user_info():
            self.log("❌ Token无效，请重新抓包获取")
            return

        # 2. 日常任务
        await self.daily_tasks()

        # 3. 阅读红包活动
        await self.red_packet_read()

        # 4. 普通阅读赚金币
        await self.get_article_list()
        if not self.art_list:
            self.log("❌ 未获取到文章列表")
            return

        self.log(f"✅ 获取到 {len(self.art_list)} 篇文章")
        num = 0
        for art_id in self.art_list:

            await self.read_task(art_id)
            wait = random.uniform(10, 15)
            self.log(f"等待 {wait:.1f} 秒...")
            time.sleep(wait)
            delay = random.randint(2, 5)
            time.sleep(delay)
            num += 1
            if num >= 10:
                break

        # 5. 查询阅读统计
        await self.get_read_stats()

    # ==================== Native API ====================

    async def get_user_info(self):
        """获取用户信息，验证token"""
        try:
            res = self._get("api/UserInfo/GetRedNumberModel")
            if not res.text:
                self.log("❌ 服务器返回空响应")
                return False

            result = res.json()

            if result.get("success"):
                data = result.get("data", {})
                userinfo = data.get("userinfo", {})
                nickname = userinfo.get("nickname", "")
                score = data.get("score", 0)
                self.log(f"✅ 用户: {nickname}，积分: {score}")
                return True
            else:
                self.log(f"❌ 获取用户信息失败: {result.get('message', '')}")
                return False
        except Exception as e:
            self.log(f"❌ 获取用户信息异常: {e}")
            return False

    async def get_article_list(self):
        """获取文章列表"""
        try:
            res = self._get("api/News/GetArticleList", {
                "ColumnId": "0",
                "PageSize": "20",
                "page": "1",
            })

            if not res.text:
                return

            result = res.json()

            if result.get("success"):
                articles = result.get("articleList", [])
                for art in articles:
                    art_id = art.get("Id", 0)
                    if art_id and art_id != 0 and art.get("newsType") != 4:
                        if art_id not in self.art_list:
                            self.art_list.append(art_id)
                self.log(f"有效文章: {len(self.art_list)} 篇")
            else:
                self.log(f"获取文章失败: {result.get('message', '')}")
        except Exception as e:
            self.log(f"❌ 获取文章列表异常: {e}")

    async def read_task(self, article_id):
        """提交阅读任务（GET方式）"""
        try:
            res = self._get("api/News/ReadNewsAward", {
                "articleId": str(article_id),
                "memberId": self.user_id,
                "seconds": str(random.randint(8, 15)),
            })

            if not res.text:
                return

            result = res.json()

            if result.get("success"):
                addcoin = result.get("addcoin", 0)
                self.total_coin += addcoin
                self.read_count += 1
                self.log(f"✅ 阅读奖励 +{addcoin}金币 (累计阅读{self.read_count}篇，+{self.total_coin}金币)")
            else:
                msg = result.get("message", result.get("Message", ""))
                self.log(f"❌ 阅读文章{article_id}失败: {msg}")
        except Exception as e:
            self.log(f"❌ 提交阅读异常: {e}")

    async def get_read_stats(self):
        """查询阅读统计"""
        try:
            res = self._get("api/UserInfo/UserCenterPageInfo", {
                "UserInfoId": self.user_id,
            })

            if not res.text:
                return

            result = res.json()

            if result.get("success"):
                data = result.get("data", {})
                userinfo = data.get("userinfo", {})
                nickname = userinfo.get("nickname", "")
                self.log(f"📊 用户: {nickname}，本次阅读: {self.read_count}篇，获得: {self.total_coin}金币")
            else:
                self.log(f"查询统计失败: {result.get('message', '')}")
        except Exception as e:
            self.log(f"❌ 查询统计异常: {e}")

    # ==================== 日常任务 ====================

    async def daily_tasks(self):
        """执行日常任务"""
        try:
            self.log("📋 开始日常任务")

            # 1. 签到
            await self._daily_sign_in()

            # 2. 获取任务列表
            task_list = await self._get_task_progress()
            if not task_list:
                return

            # 3. 新闻点赞（需要5次）
            await self._do_news_like(task_list)

            # 4. 帖子点赞（只给正能量帖子点赞）
            await self._do_posts_like(task_list)

            # 5. 帖子评论点赞（只给正能量帖子的评论点赞）
            await self._do_posts_reply_like(task_list)

            # 6. 阅读新闻（已在主流程中完成）

        except Exception as e:
            self.log(f"❌ 日常任务异常: {e}")

    async def _daily_sign_in(self):
        """每日签到"""
        try:
            res = self._get("api/UserInfo/UserSignIn")
            if not res.text:
                return
            result = res.json()
            if result.get("success"):
                data = result.get("data", {})
                add_score = data.get("addScore", 0)
                score = data.get("score", 0)
                self.log(f"✅ 签到成功！积分+{add_score}，当前{score}积分")
            else:
                msg = result.get("message", "")
                if "已签到" in msg or "已经签到" in msg or not msg:
                    self.log("📋 今日已签到")
                else:
                    self.log(f"❌ 签到失败: {msg}")
        except Exception as e:
            self.log(f"❌ 签到异常: {e}")

    async def _get_task_progress(self):
        """获取任务进度列表"""
        try:
            res = self._get("api/UserInfo/TaskProgress")
            if not res.text:
                return []
            result = res.json()
            if not result.get("success"):
                self.log(f"❌ 获取任务列表失败: {result.get('message', '')}")
                return []

            tasks = result.get("data", [])
            self.log(f"📋 任务列表 ({len(tasks)}个):")
            for task in tasks:
                name = task.get("taskName", "")
                state = task.get("state", -1)
                progress = task.get("myProgress", 0)
                total = task.get("totalProgress", 0)
                award = task.get("awardScore", 0)
                status = "✅已完成" if state == 1 else f"⏳{progress}/{total}"
                self.log(f"  {name}: {status}, 奖励{award}积分")
            return tasks
        except Exception as e:
            self.log(f"❌ 获取任务列表异常: {e}")
            return []

    async def _do_news_like(self, task_list=None):
        """新闻点赞（需要5次）"""
        try:
            # 检查点赞任务是否已完成
            like_task = None
            need_like = 5
            if task_list:
                for task in task_list:
                    name = task.get("taskName", "")
                    if "点赞" in name:
                        like_task = task
                        need_like = task.get("totalProgress", 5) - task.get("myProgress", 0)
                        break

            if like_task and like_task.get("state") == 1:
                self.log("📋 新闻点赞任务已完成，跳过")
                return

            if need_like <= 0:
                self.log("📋 新闻点赞任务已完成")
                return

            # 多页获取文章列表
            liked = 0
            already_liked_count = 0
            max_already_liked = 30  # 连续30篇已赞过就放弃

            for page in range(1, 6):
                if liked >= need_like:
                    break

                res = self._get("api/News/GetArticleList", {
                    "ColumnId": "0",
                    "PageSize": "20",
                    "page": str(page),
                })
                if not res.text:
                    break

                result = res.json()
                if not result.get("success"):
                    break

                articles = result.get("articleList", [])
                if not articles:
                    break

                for art in articles:
                    if liked >= need_like:
                        break
                    art_id = art.get("Id")
                    news_type = art.get("newsType", 1)
                    if not art_id or news_type == 4:
                        continue

                    res = self._get("api/News/SayGood", {
                        "articleId": str(art_id),
                        "newsType": str(news_type),
                    })
                    if not res.text:
                        continue

                    result = res.json()
                    if result.get("success"):
                        liked += 1
                        already_liked_count = 0
                        self.log(f"👍 点赞成功 ({liked}/{need_like}): 文章{art_id}")
                    else:
                        msg = result.get("message", "")
                        if "已赞" in msg:
                            already_liked_count += 1
                            if already_liked_count >= max_already_liked:
                                self.log("📋 连续多篇文章已赞过，停止点赞")
                                break
                        else:
                            already_liked_count = 0

                    time.sleep(random.uniform(0.5, 1.5))

                if already_liked_count >= max_already_liked:
                    break

            if liked >= need_like:
                self.log(f"✅ 新闻点赞任务完成 ({liked}次)")
            else:
                self.log(f"📋 新闻点赞: 完成{liked}次，还需{need_like - liked}次")

        except Exception as e:
            self.log(f"❌ 新闻点赞异常: {e}")

    def _is_positive_post(self, post):
        """判断帖子是否为正能量内容（通过话题ID、话题名、帖子摘要判断，不够则获取详情）"""
        positive_keywords = [
            "正能量", "好人", "榜样", "志愿", "公益", "文明", "慈溪超有爱",
            "学习雷锋", "感动", "温暖", "致敬", "最美", "先锋", "模范",
            "奉献", "助人", "爱心", "善举", "见义勇为", "孝心", "诚信",
            "祝福", "赞美", "点亮", "心愿",
        ]
        # 匹配话题ID
        if post.get("topicId") in self._positive_topic_ids:
            return True
        # 匹配话题名
        topic_title = post.get("topicTitle", "")
        if any(kw in topic_title for kw in positive_keywords):
            return True
        # 匹配帖子摘要
        detail = post.get("detail", "")
        if any(kw in detail for kw in positive_keywords):
            return True
        # 摘要不够，获取帖子详情判断
        post_id = post.get("postsId")
        if post_id:
            res = self._get("api/Posts/GetPostsDetail", {
                "PostsId": str(post_id),
                "UserInfoId": self.user_id,
            })
            if res.text:
                result = res.json()
                if result.get("success"):
                    data = result.get("data", {})
                    full_detail = data.get("detail", "")
                    if any(kw in full_detail for kw in positive_keywords):
                        return True
        return False

    async def _do_posts_like(self, task_list=None):
        """帖子点赞（只给正能量帖子点赞）"""
        try:
            # 正能量话题ID（通过话题名关键词匹配得到）
            self._positive_topic_ids = {587, 610, 620}

            # 检查帖子点赞任务是否已完成
            like_task = None
            need_like = 5
            if task_list:
                for task in task_list:
                    name = task.get("taskName", "")
                    if "帖子点赞" in name or "圈子点赞" in name:
                        like_task = task
                        need_like = task.get("totalProgress", 5) - task.get("myProgress", 0)
                        break

            if like_task and like_task.get("state") == 1:
                self.log("📋 帖子点赞任务已完成，跳过")
                return

            if need_like <= 0:
                self.log("📋 帖子点赞任务已完成")
                return

            # 先动态获取正能量话题ID
            positive_keywords = [
                "正能量", "好人", "榜样", "志愿", "公益", "文明", "慈溪超有爱",
                "学习雷锋", "感动", "温暖", "致敬", "最美", "先锋", "模范",
                "奉献", "助人", "爱心", "善举", "见义勇为", "孝心", "诚信",
                "祝福", "赞美", "点亮", "心愿",
            ]
            res = self._get("api/Posts/TopicList", {"page": "1", "pageSize": "50"})
            if res.text:
                result = res.json()
                if result.get("success"):
                    for topic in result.get("data", []):
                        name = topic.get("subjectName", "")
                        if any(kw in name for kw in positive_keywords):
                            self._positive_topic_ids.add(topic.get("Id"))

            # 获取帖子列表
            liked = 0
            for page in range(1, 21):
                if liked >= need_like:
                    break

                res = self._get("api/Posts/GetPostsList", {
                    "page": str(page),
                    "pageSize": "20",
                })
                if not res.text:
                    break

                result = res.json()
                if not result.get("success"):
                    break

                posts = result.get("postsList", [])
                if not posts:
                    break

                for post in posts:
                    if liked >= need_like:
                        break

                    post_id = post.get("postsId")
                    is_say_good = post.get("isSayGood", False)

                    if not post_id or is_say_good:
                        continue

                    # 获取帖子详情判断是否正能量
                    if not self._is_positive_post(post):
                        continue

                    topic_title = post.get("topicTitle", "")
                    res = self._get("api/Posts/SayGood", {
                        "PostsId": str(post_id),
                        "UserInfoId": self.user_id,
                    })
                    if not res.text:
                        continue

                    result = res.json()
                    if result.get("success"):
                        liked += 1
                        self.log(f"👍 帖子点赞成功 ({liked}/{need_like}): [{topic_title}] 文章{post_id}")
                    else:
                        msg = result.get("message", "")
                        if "已赞" in msg:
                            liked += 1

                    time.sleep(random.uniform(1, 3))

            if liked >= need_like:
                self.log(f"✅ 帖子点赞任务完成 ({liked}次)")
            else:
                self.log(f"📋 帖子点赞: 完成{liked}次（正能量帖子不足）")

        except Exception as e:
            self.log(f"❌ 帖子点赞异常: {e}")

    async def _do_posts_reply_like(self, task_list=None):
        """帖子评论点赞（只给正能量帖子的评论点赞）"""
        try:
            # 检查帖子评论点赞任务
            like_task = None
            need_like = 5
            if task_list:
                for task in task_list:
                    name = task.get("taskName", "")
                    if "评论点赞" in name:
                        like_task = task
                        need_like = task.get("totalProgress", 5) - task.get("myProgress", 0)
                        break

            if like_task and like_task.get("state") == 1:
                self.log("📋 帖子评论点赞任务已完成，跳过")
                return

            if need_like <= 0:
                self.log("📋 帖子评论点赞任务已完成")
                return

            # 获取正能量帖子
            liked = 0
            checked_posts = set()

            for page in range(1, 21):
                if liked >= need_like:
                    break

                res = self._get("api/Posts/GetPostsList", {
                    "page": str(page),
                    "pageSize": "20",
                })
                if not res.text:
                    break

                result = res.json()
                if not result.get("success"):
                    break

                posts = result.get("postsList", [])
                if not posts:
                    break

                for post in posts:
                    if liked >= need_like:
                        break

                    post_id = post.get("postsId")

                    if not post_id or post_id in checked_posts:
                        continue

                    # 获取帖子详情判断是否正能量
                    if not self._is_positive_post(post):
                        continue

                    checked_posts.add(post_id)

                    # 获取帖子回复
                    res = self._get("api/Posts/GetPostsReply", {
                        "PostsId": str(post_id),
                        "page": "1",
                        "pageSize": "10",
                    })
                    if not res.text:
                        continue

                    result = res.json()
                    if not result.get("success"):
                        continue

                    replies = result.get("data", [])
                    for reply in replies:
                        if liked >= need_like:
                            break

                        reply_id = reply.get("Id")
                        is_say_good = reply.get("isSayGood", False)

                        if not reply_id or is_say_good:
                            continue

                        res = self._get("api/Posts/SayReplyGood", {
                            "ReplyId": str(reply_id),
                            "UserInfoId": self.user_id,
                        })
                        if not res.text:
                            continue

                        result = res.json()
                        if result.get("success"):
                            liked += 1
                            addcoin = result.get("addcoin", 0)
                            self.log(f"👍 评论点赞成功 ({liked}/{need_like}): 帖子{post_id}的评论{reply_id} +{addcoin}金币")

                        time.sleep(random.uniform(1, 2))

            if liked >= need_like:
                self.log(f"✅ 帖子评论点赞任务完成 ({liked}次)")
            else:
                self.log(f"📋 帖子评论点赞: 完成{liked}次（正能量帖子评论不足）")

        except Exception as e:
            self.log(f"❌ 帖子评论点赞异常: {e}")

    # ==================== H5 阅读红包活动 ====================

    async def red_packet_read(self):
        """阅读红包活动（自动获取所有活动）"""
        try:
            self.log("🧧 开始阅读红包活动")

            # 1. 获取活动列表
            res = self._h5_get("api/YunyingV720/ReadActivityTaskList",
                               referer="https://cxh5.xiaodingkeji.com/h5/redPacket/")

            if not res.text:
                self.log("❌ 获取活动列表失败")
                return

            result = res.json()
            if not result.get("success"):
                self.log(f"❌ 获取活动列表失败: {result.get('message', '')}")
                return

            activities = result.get("data", [])
            if not activities:
                self.log("🧧 当前没有红包活动")
                return

            self.log(f"🧧 发现 {len(activities)} 个红包活动")

            # 2. 逐个活动完成
            for activity in activities:
                act_id = activity.get("yunyingActivityTaskId")
                title = activity.get("curTaskTitle", "")
                round_num = activity.get("round", 0)
                self.log(f"🧧 活动: {title} (第{round_num}轮, ID:{act_id})")
                await self._do_red_packet_task(act_id, title, round_num)

        except Exception as e:
            self.log(f"❌ 阅读红包活动异常: {e}")

    async def _do_red_packet_task(self, act_id, title="", round_num=1):
        """完成单个红包活动的阅读任务"""
        from urllib.parse import quote
        referer = f"https://cxh5.xiaodingkeji.com/h5/redPacket/task.html?yunyingActivityTaskId={act_id}&taskName={quote(title)}&taskRound={round_num}"

        # 标记本轮是否已在阅读过程中抽奖
        self._drawn_this_round = False

        # 0. 检查验证码状态（腾讯防水墙）
        is_captcha_verified = await self._check_captcha(referer)
        if not is_captcha_verified:
            self.log("⚠️ 验证码未通过，阅读可能无法获得积分")

        # 1. 获取活动任务数据
        res = self._h5_get("api/YunyingV720/ReadActivityTaskData", {
            "yunyingActivityTaskId": str(act_id),
        }, referer=referer)

        if not res.text:
            self.log("❌ 获取活动数据失败")
            return

        result = res.json()
        if not result.get("success"):
            self.log(f"❌ 获取活动数据失败: {result.get('message', '')}")
            return

        task_data = result.get("data", {})
        total = task_data.get("totalCount", 0)
        completed = task_data.get("completedCount", 0)
        uncomplete = task_data.get("uncompleteCount", 0)

        self.log(f"🧧 共{total}篇，已完成{completed}篇，未完成{uncomplete}篇")

        if uncomplete == 0:
            self.log("🧧 活动文章已全部完成，尝试抽红包")
            await self._draw_award(act_id, title, round_num)
            return

        # 2. 逐篇完成未读文章
        task_details = task_data.get("taskDetails", [])
        for detail in task_details:
            if detail.get("isComplete"):
                continue

            article_id = detail.get("articleId")
            task_detail_id = detail.get("taskDetailId")
            art_title = detail.get("title", "")[:20]
            art_url = detail.get("url", "")

            # 1. 先打开文章页面（模拟APP中WebView加载文章，服务端可能据此验证阅读）
            self.log(f"🧧 正在阅读: {art_title}...")
            if art_url:
                try:
                    self.h5_session.get(art_url, headers={"Referer": referer}, timeout=10)
                except Exception:
                    pass

            # 2. 模拟阅读等待（需12秒以上才能获得积分和抽奖资格）
            wait = random.uniform(13, 20)
            time.sleep(wait)

            # 3. 提交阅读（带上阅读秒数）
            read_seconds = int(wait)
            res = self._h5_get("api/YunyingV720/ReadArticle", {
                "taskDetailId": str(task_detail_id),
                "articleId": str(article_id),
                "seconds": str(read_seconds),
            }, referer=referer)

            if not res.text:
                continue

            read_result = res.json()
            if read_result.get("success"):
                self.read_count += 1
                addcoin = read_result.get("addcoin", 0)
                studyscore = read_result.get("studyscore", 0)
                self.log(f"🧧 阅读完成: {art_title}... (已读{self.read_count}篇, {read_seconds}秒)")
                # 红包活动阅读本身不给积分(addcoin=0是正常的)，积分通过抽奖获得
                if addcoin > 0 or studyscore > 0:
                    self.log(f"🧧 💰 额外获得: +{addcoin}积分 +{studyscore}学习分")
            else:
                self.log(f"🧧 阅读失败: {art_title}... {read_result.get('message', '')}")

            # 4. 调用ChceckCompleteTaskDetail检查阅读完成状态并获取抽奖资格
            #    这是H5页面在用户从文章返回时调用的关键API
            #    它会返回 isComplete(是否完成) 和 isCanDrawAward(是否获得抽奖资格)
            time.sleep(random.uniform(1, 2))
            check_res = self._h5_get("api/YunyingV720/ChceckCompleteTaskDetail", {
                "taskDetailId": str(task_detail_id),
                "yunyingActivityTaskId": str(act_id),
                "round": str(round_num),
            }, referer=referer)

            if check_res.text:
                check_result = check_res.json()
                if check_result.get("success"):
                    check_data = check_result.get("data", {})
                    is_complete = check_data.get("isComplete", False)
                    is_can_draw = check_data.get("isCanDrawAward", False)
                    award_record = check_data.get("awardRecord", {})

                    if is_complete:
                        self.log(f"🧧 ✅ 阅读验证通过: {art_title}...")
                    else:
                        self.log(f"🧧 ⚠️ 阅读验证未通过(阅读太快?)，服务端认为未完成")

                    if is_can_draw and award_record:
                        award_record_id = award_record.get("awardRecordId", 0)
                        self.log(f"🧧 🎉 获得抽奖资格! awardRecordId={award_record_id}")
                        # 立即抽奖
                        await self._draw_single_award(award_record_id, referer)
                        # 标记本轮已抽奖，避免阅读完成后重复抽奖
                        self._drawn_this_round = True
                else:
                    self.log(f"🧧 检查阅读状态失败: {check_result.get('message', '')}")
            else:
                self.log(f"🧧 检查阅读状态无响应")

            # 间隔
            time.sleep(random.uniform(1, 3))

        # 3. 阅读完成后等待服务端处理，然后刷新确认
        self.log("🧧 阅读完成，等待服务端处理...")
        time.sleep(random.uniform(3, 6))

        # 重新获取任务数据确认状态
        res = self._h5_get("api/YunyingV720/ReadActivityTaskData", {
            "yunyingActivityTaskId": str(act_id),
        }, referer=referer)

        if res.text:
            result = res.json()
            if result.get("success"):
                task_data = result.get("data", {})
                uncomplete = task_data.get("uncompleteCount", 0)
                completed = task_data.get("completedCount", 0)
                self.log(f"🧧 刷新状态: 已完成{completed}篇，未完成{uncomplete}篇")

                if uncomplete > 0:
                    self.log(f"🧧 还有{uncomplete}篇未完成，继续阅读")
                    # 递归处理剩余文章
                    await self._do_red_packet_task(act_id, title, round_num)
                    return

        # 4. 全部完成后抽红包（如果阅读过程中已经抽过则跳过）
        if self._drawn_this_round:
            self.log("🧧 阅读过程中已抽奖，跳过重复抽奖")
        else:
            await self._draw_award(act_id, title, round_num)

    async def _draw_single_award(self, award_record_id, referer=""):
        """抽单个红包"""
        try:
            res = self._h5_get("api/YunyingV720/DrawAward", {
                "awardRecordId": str(award_record_id),
            }, referer=referer)

            if not res.text:
                self.log(f"🧧 抽红包无响应")
                return

            draw_result = res.json()
            if draw_result.get("success"):
                data = draw_result.get("data", {})
                award_name = data.get("name", "")
                award_type = data.get("awardType", 0)
                award_amount = data.get("award", 0)
                score_award = data.get("scoreAward", 0)
                award_record_id = data.get("awardRecordId", 0)
                # 详细输出抽奖结果
                self.log(f"🧧 🎉 抽红包结果: name={award_name}, type={award_type}, award={award_amount}, scoreAward={score_award}")
                if score_award > 0:
                    self.log(f"🧧 🎉 抽红包成功！获得 {score_award} 积分")
                    self.total_coin += score_award
                elif award_amount > 0 and award_type == 1:
                    # 现金红包需要调用GrantAward领取
                    self.log(f"🧧 🎉 抽中现金红包 {award_amount} 元！正在领取...")
                    await self._grant_award(award_record_id, referer)
                elif award_amount > 0:
                    self.log(f"🧧 🎉 抽红包成功！获得 {award_amount}")
                    self.total_coin += award_amount
                else:
                    self.log(f"🧧 🎉 抽红包成功！未中奖（谢谢参与）")
            else:
                self.log(f"🧧 抽红包失败: {draw_result.get('message', '')}")
        except Exception as e:
            self.log(f"❌ 抽红包异常: {e}")

    async def _grant_award(self, award_record_id, referer=""):
        """领取现金红包奖励"""
        try:
            res = self._h5_get("api/YunyingV720/GrantAward", {
                "awardRecordId": str(award_record_id),
            }, referer=referer)

            if not res.text:
                self.log(f"🧧 领取奖励无响应")
                return

            result = res.json()
            if result.get("success"):
                self.log(f"🧧 💰 现金红包领取成功！")
            else:
                msg = result.get("message", "")
                self.log(f"🧧 领取奖励失败: {msg}")
                if result.get("code") == -100:
                    self.log(f"🧧 需要绑定支付宝账号才能领取现金红包")
        except Exception as e:
            self.log(f"❌ 领取奖励异常: {e}")

    async def _check_captcha(self, referer=""):
        """检查验证码状态（腾讯防水墙），返回是否已通过验证"""
        try:
            res = self._h5_get("api/YunyingV720/CheckTencentSign", referer=referer)
            if not res.text:
                return False
            result = res.json()
            if result.get("success"):
                self.log("🧧 ✅ 验证码状态: 已通过")
                return True
            else:
                self.log(f"🧧 ⚠️ 验证码状态: 未通过 - {result.get('message', '')}")
                return False
        except Exception as e:
            self.log(f"❌ 检查验证码异常: {e}")
            return False

    async def _draw_award(self, task_id, title="", round_num=1):
        """抽红包（先获取可抽奖品列表，再逐个抽奖，带重试机制）"""
        try:
            from urllib.parse import quote
            task_id = str(task_id)
            referer = f"https://cxh5.xiaodingkeji.com/h5/redPacket/task.html?yunyingActivityTaskId={task_id}&taskName={quote(title)}&taskRound={round_num}"

            # 1. 获取可抽奖品列表（最多重试3次）
            prize_list = []
            for retry in range(3):
                res = self._h5_get("api/YunyingV720/CanDrawPrizeList", {
                    "yunyingActivityTaskId": task_id,
                }, referer=referer)

                if not res.text:
                    self.log(f"🧧 获取可抽奖品失败（重试{retry+1}/3）")
                    time.sleep(random.uniform(3, 6))
                    continue

                result = res.json()
                if not result.get("success"):
                    self.log(f"🧧 获取可抽奖品失败: {result.get('message', '')}（重试{retry+1}/3）")
                    time.sleep(random.uniform(3, 6))
                    continue

                prize_list = result.get("data", [])
                if prize_list:
                    break

                self.log(f"🧧 没有可抽的奖（重试{retry+1}/3）")
                time.sleep(random.uniform(5, 10))

            if not prize_list:
                self.log("🧧 多次重试后仍无可抽的奖，可能抽奖资格未生效")
                return

            self.log(f"🧧 发现 {len(prize_list)} 个可抽红包")

            # 2. 逐个抽奖
            for prize in prize_list:
                award_record_id = prize.get("awardRecordId")
                if not award_record_id:
                    continue

                await self._draw_single_award(award_record_id, referer)
                time.sleep(random.uniform(1, 3))

        except Exception as e:
            self.log(f"❌ 抽红包异常: {e}")


def check_env():
    """检查环境变量"""
    ck_name = "cixiao_ck"
    env_splitor = ["@", "\n"]

    ck_env = os.getenv(ck_name, "")
    if not ck_env:
        print(f"❌ 未找到环境变量 {ck_name}，请在青龙面板中配置")
        print(f"格式: token#userId#deviceId，多账号用 @ 分隔")
        return []

    sep = env_splitor[0]
    for s in env_splitor:
        if s in ck_env:
            sep = s
            break

    accounts = [acc.strip() for acc in ck_env.split(sep) if acc.strip()]
    print(f"共找到 {len(accounts)} 个账号")
    return accounts


async def start(accounts):
    """启动所有账号任务"""
    for idx, account_str in enumerate(accounts, 1):
        user = CiXiaoApp(idx, account_str)
        if user.ck_status:
            await user.main()


def main():
    """入口函数"""
    print("=" * 40)
    print("  慈晓app自动阅读脚本")
    print("=" * 40)

    accounts = check_env()
    if not accounts:
        return

    import asyncio
    asyncio.run(start(accounts))

    print("\n✅ 所有账号执行完毕")


if __name__ == "__main__":
    # 测试模式：取消注释下面这行填入ck测试
    // os.environ[
    //     "cixiao_ck"] = "65-83-71-8B-71-66-A7-36-BA-1E-45-2F-A1-4B-2A-64-4F-5D-99-47-0D-CD-7E-DC-30-72-4B-4B-13-8B-63-01-4D-32-50-E3-D4-85-5C-17-F9-BF-CB-46-6A-AA-BC-9B-E5-12-5B-43-1F-F0-10-7A-71-9C-2C-7D-28-5D-8C-24-14-28-80-1F-44-82-2A-E6-06-79-72-57-F0-3B-F1-BA-B6-73-85-7F-3A-AD-FA-E5#863670#BB5AC7DB8130A4FC6C7BF8504D75F4CFA2258DD2"

    main()
