/**
 * 中国移动云盘签到（青龙面板版）
 *
 * 环境变量：
 * export CLOUD_DRIVE_AUTH='Basic XXXXXXXX'    多账号用 & 或换行分隔
 * export CLOUD_DRIVE_PHONE='手机号'           多账号用 & 或换行分隔，与AUTH一一对应
 * export CLOUD_DRIVE_AUTH_TOKEN='authToken'   多账号用 & 或换行分隔（可选，用于笔记任务）
 *
 * ========== 变量获取方法 ==========
 *
 * 【CLOUD_DRIVE_AUTH】Authorization认证信息（必填）
 *   格式：Basic base64(手机号:token)
 *   方法一：从APP数据库提取token后自行构造
 *     1. 手机连接电脑，开启ADB：adb connect 192.168.6.127:5555
 *     2. 提取token：
 *        adb shell "su -c 'sqlite3 /data/data/com.chinamobile.mcloud/databases/cloud.db \"SELECT * FROM auth_table\"'"
 *     3. 构造Basic认证：base64编码 "手机号:token"
 *        例如：base64("13317969292:jylS5zPo|1|RCS|...") = "MTMz..."
 *     4. 最终格式：Basic MTMz...
 *
 *   方法二：抓包获取（需绕过代理检测）
 *     1. 使用Frida注入bypass脚本绕过代理检测
 *     2. 用抓包工具捕获请求头中的Authorization字段
 *     3. 直接复制Basic后面的内容
 *
 * 【CLOUD_DRIVE_PHONE】手机号（必填）
 *   与AUTH一一对应，用于刷新token时指定账号
 *
 * 【CLOUD_DRIVE_AUTH_TOKEN】笔记认证Token（可选）
 *   抓包搜索 authTokenRefresh.do，响应体中 <token>xxx</token> 的xxx值
 *   用于完成"创建笔记"任务
 *
 * cron: 0 8 * * *
 */
const axios = require('axios');

var authList = process.env.CLOUD_DRIVE_AUTH ? process.env.CLOUD_DRIVE_AUTH.split(/[\n&]/) : [];
var phoneList = process.env.CLOUD_DRIVE_PHONE ? process.env.CLOUD_DRIVE_PHONE.split(/[\n&]/) : [];
var authTokenList = process.env.CLOUD_DRIVE_AUTH_TOKEN ? process.env.CLOUD_DRIVE_AUTH_TOKEN.split(/[\n&]/) : [];
var message = '';

var UA = 'Mozilla/5.0 (Linux; Android 11; M2012K10C Build/RP1A.200720.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/90.0.4430.210 Mobile Safari/537.36 MCloudApp/10.0.1';

var JwtHeaders = {
    'User-Agent': UA,
    'Accept': '*/*',
    'Host': 'caiyun.feixin.10086.cn:7071'
};

var currentAccount = '';
var currentAuthorization = '';
var currentAuthToken = '';

var SKIP_TASK_IDS_CLOUD_APP_MONTH = [110, 113, 417, 409];
var SKIP_TASK_IDS_CLOUD_APP_DAY = [404];
var SKIP_TASK_IDS_EMAIL_APP_MONTH = [1004, 1005, 1015, 1020];

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomWait(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function sendRequest(config) {
    try {
        config.timeout = config.timeout || 15000;
        var response = await axios(config);
        return response.data;
    } catch (e) {
        if (e.response) {
            throw { response: e.response };
        }
        throw e;
    }
}

async function refreshToken(authorization, account) {
    try {
        var data = await sendRequest({
            method: 'post',
            url: 'https://orches.yun.139.com/orchestration/auth-rebuild/token/v1.0/querySpecToken',
            headers: {
                'Authorization': authorization,
                'User-Agent': UA,
                'Content-Type': 'application/json',
                'Accept': '*/*',
                'Host': 'orches.yun.139.com'
            },
            data: {
                account: account,
                toSourceId: '001005'
            }
        });
        if (data.success) {
            return data.data.token;
        }
        console.log('刷新token失败: ' + JSON.stringify(data));
        return null;
    } catch (e) {
        console.log('刷新token异常: ' + (e.response ? JSON.stringify(e.response.data).substring(0, 200) : e.message || e));
        return null;
    }
}

async function getJwtToken(ssoToken) {
    try {
        var data = await sendRequest({
            method: 'post',
            url: 'https://caiyun.feixin.10086.cn:7071/portal/auth/tyrzLogin.action?ssoToken=' + ssoToken,
            headers: JwtHeaders
        });
        if (data.code === 0) {
            return data.result.token;
        }
        console.log('获取jwtToken失败: ' + (data.msg || JSON.stringify(data)));
        return null;
    } catch (e) {
        console.log('获取jwtToken异常: ' + (e.response ? JSON.stringify(e.response.data).substring(0, 200) : e.message || e));
        return null;
    }
}

async function initAuth(authorization, account) {
    currentAuthorization = authorization;
    currentAccount = account;
    var ssoToken = await refreshToken(authorization, account);
    if (!ssoToken) {
        console.log('获取ssoToken失败，请检查Authorization是否正确');
        return false;
    }
    console.log('ssoToken获取成功');

    var jwtToken = await getJwtToken(ssoToken);
    if (!jwtToken) {
        console.log('获取jwtToken失败');
        return false;
    }
    console.log('jwtToken获取成功');

    JwtHeaders['jwtToken'] = jwtToken;
    return true;
}

async function querySignInStatus() {
    try {
        var data = await sendRequest({
            method: 'get',
            url: 'https://caiyun.feixin.10086.cn/market/signin/page/info?client=app',
            headers: JwtHeaders
        });
        if (data.msg === 'success' && data.result && data.result.todaySignIn) {
            console.log('今日已签到');
            message += '今日已签到\n';
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

async function signIn() {
    try {
        var data = await sendRequest({
            method: 'get',
            url: 'https://caiyun.feixin.10086.cn/market/manager/commonMarketconfig/getByMarketRuleName?marketName=sign_in_3',
            headers: JwtHeaders
        });
        if (data.msg === 'success') {
            console.log('签到成功');
            message += '签到成功\n';
            return true;
        }
        console.log('签到失败: ' + (data.msg || JSON.stringify(data)));
        message += '签到失败\n';
        return false;
    } catch (e) {
        console.log('签到异常: ' + (e.response ? JSON.stringify(e.response.data).substring(0, 200) : e.message || e));
        message += '签到异常\n';
        return false;
    }
}

async function doPoke() {
    var successCount = 0;
    var maxPoke = 15;
    for (var i = 0; i < maxPoke; i++) {
        try {
            var data = await sendRequest({
                method: 'get',
                url: 'https://caiyun.feixin.10086.cn/market/signin/task/click?key=task&id=319',
                headers: JwtHeaders
            });
            if (data && data.result) {
                successCount++;
            }
            await sleep(300);
        } catch (e) { }
    }
    if (successCount > 0) {
        console.log('戳一戳成功 ' + successCount + '/' + maxPoke + ' 次');
        message += '戳一戳成功 ' + successCount + '/' + maxPoke + ' 次\n';
    } else {
        console.log('戳一戳未获得奖励');
        message += '戳一戳未获得奖励\n';
    }
}

async function doShake() {
    var successCount = 0;
    var maxShake = 15;
    for (var i = 0; i < maxShake; i++) {
        try {
            var data = await sendRequest({
                method: 'post',
                url: 'https://caiyun.feixin.10086.cn:7071/market/shake-server/shake/shakeIt?flag=1',
                headers: JwtHeaders
            });
            if (data && data.result && data.result.shakePrizeConfig) {
                console.log('摇一摇获得: ' + data.result.shakePrizeConfig.name);
                successCount++;
            }
            await sleep(1000);
        } catch (e) { }
    }
    if (successCount > 0) {
        console.log('摇一摇成功 ' + successCount + '/' + maxShake + ' 次');
        message += '摇一摇成功 ' + successCount + '/' + maxShake + ' 次\n';
    } else {
        console.log('摇一摇未中奖');
        message += '摇一摇未中奖\n';
    }
}

async function wxAppSign() {
    try {
        var data = await sendRequest({
            method: 'get',
            url: 'https://caiyun.feixin.10086.cn/market/playoffic/followSignInfo?isWx=true',
            headers: JwtHeaders
        });
        if (data.msg === 'success' && data.result && data.result.todaySignIn) {
            console.log('公众号签到成功');
            message += '公众号签到成功\n';
        } else {
            console.log('公众号签到失败（可能未绑定公众号）');
            message += '公众号签到失败\n';
        }
    } catch (e) {
        console.log('公众号签到异常: ' + (e.response ? JSON.stringify(e.response.data).substring(0, 200) : e.message || e));
    }
}

async function getTaskList(marketName) {
    try {
        var data = await sendRequest({
            method: 'get',
            url: 'https://caiyun.feixin.10086.cn/market/signin/task/taskList?marketname=' + marketName,
            headers: JwtHeaders
        });
        if (data.msg === 'success') {
            return data.result || {};
        }
        return {};
    } catch (e) {
        return {};
    }
}

async function clickTask(taskId) {
    try {
        var data = await sendRequest({
            method: 'get',
            url: 'https://caiyun.feixin.10086.cn/market/signin/task/click?key=task&id=' + taskId,
            headers: JwtHeaders
        });
        return data;
    } catch (e) {
        return null;
    }
}

function shouldSkipTask(taskId, taskType, marketKey) {
    if (marketKey === 'cloud_app' && taskType === 'month') {
        return SKIP_TASK_IDS_CLOUD_APP_MONTH.indexOf(taskId) !== -1;
    }
    if (marketKey === 'cloud_app' && taskType === 'day') {
        return SKIP_TASK_IDS_CLOUD_APP_DAY.indexOf(taskId) !== -1;
    }
    if (marketKey === 'email_app' && taskType === 'month') {
        return SKIP_TASK_IDS_EMAIL_APP_MONTH.indexOf(taskId) !== -1;
    }
    return false;
}

async function uploadZeroFile() {
    try {
        var xmlBody = [
            '<pcUploadFileRequest>',
            '<ownerMSISDN>' + currentAccount + '</ownerMSISDN>',
            '<fileCount>1</fileCount>',
            '<totalSize>1</totalSize>',
            '<uploadContentList length="1">',
            '<uploadContentInfo>',
            '<comlexFlag>0</comlexFlag>',
            '<contentDesc><![CDATA[]]></contentDesc>',
            '<contentName><![CDATA[000000.txt]]></contentName>',
            '<contentSize>1</contentSize>',
            '<contentTAGList></contentTAGList>',
            '<digest>C4CA4238A0B923820DCC509A6F75849B</digest>',
            '<exif/>',
            '<fileEtag>0</fileEtag>',
            '<fileVersion>0</fileVersion>',
            '<updateContentID></updateContentID>',
            '</uploadContentInfo>',
            '</uploadContentList>',
            '<newCatalogName></newCatalogName>',
            '<parentCatalogID></parentCatalogID>',
            '<operation>0</operation>',
            '<path></path>',
            '<manualRename>2</manualRename>',
            '<autoCreatePath length="0"/>',
            '<tagID></tagID>',
            '<tagType></tagType>',
            '</pcUploadFileRequest>'
        ].join('');
        await axios({
            method: 'post',
            url: 'http://ose.caiyun.feixin.10086.cn/richlifeApp/devapp/IUploadAndDownload',
            headers: {
                'x-huawei-uploadSrc': '1',
                'x-ClientOprType': '11',
                'Connection': 'keep-alive',
                'x-NetType': '6',
                'x-DeviceInfo': '6|127.0.0.1|1|10.0.1|Xiaomi|M2012K10C|CB63218727431865A48E691BFFDB49A1|02-00-00-00-00-00|android 11|1080X2272|zh||||032|',
                'x-huawei-channelSrc': '10000023',
                'x-MM-Source': '032',
                'x-SvcType': '1',
                'APP_NUMBER': currentAccount,
                'Authorization': currentAuthorization,
                'Host': 'ose.caiyun.feixin.10086.cn',
                'User-Agent': 'okhttp/3.11.0',
                'Content-Type': 'application/xml; charset=UTF-8',
                'Accept': '*/*'
            },
            data: xmlBody,
            timeout: 15000
        });
        console.log('上传任务文件完成');
    } catch (e) {
        console.log('上传任务文件失败: ' + (e.response ? e.response.status : e.message || e));
    }
}

async function refreshNoteToken() {
    if (!currentAuthToken || currentAuthToken === '00') return false;
    try {
        var res = await axios({
            method: 'post',
            url: 'http://mnote.caiyun.feixin.10086.cn/noteServer/api/authTokenRefresh.do',
            headers: {
                'X-Tingyun-Id': 'p35OnrDoP8k;c=2;r=1122634489;u=43ee994e8c3a6057970124db00b2442c::8B3D3F05462B6E4C',
                'Charset': 'UTF-8',
                'Connection': 'Keep-Alive',
                'User-Agent': 'mobile',
                'APP_CP': 'android',
                'CP_VERSION': '3.2.0',
                'x-huawei-channelsrc': '10001400',
                'Host': 'mnote.caiyun.feixin.10086.cn',
                'Content-Type': 'application/json; charset=UTF-8',
                'Accept': '*/*'
            },
            data: {
                authToken: currentAuthToken,
                userPhone: currentAccount
            },
            timeout: 15000
        });
        var noteToken = res.headers['note_token'] || res.headers['NOTE_TOKEN'] || '';
        var appAuth = res.headers['app_auth'] || res.headers['APP_AUTH'] || '';
        if (noteToken && appAuth) {
            return { noteToken: noteToken, appAuth: appAuth };
        }
        return false;
    } catch (e) {
        return false;
    }
}

async function createDefaultNote() {
    var noteAuth = await refreshNoteToken();
    if (!noteAuth) {
        console.log('跳过创建笔记: 缺少authToken');
        return;
    }
    var noteHeaders = {
        'X-Tingyun-Id': 'p35OnrDoP8k;c=2;r=1122634489;u=43ee994e8c3a6057970124db00b2442c::8B3D3F05462B6E4C',
        'Charset': 'UTF-8',
        'Connection': 'Keep-Alive',
        'User-Agent': 'mobile',
        'APP_CP': 'android',
        'CP_VERSION': '3.2.0',
        'x-huawei-channelsrc': '10001400',
        'Host': 'mnote.caiyun.feixin.10086.cn',
        'Content-Type': 'application/json; charset=UTF-8',
        'Accept': '*/*',
        'APP_NUMBER': currentAccount,
        'APP_AUTH': noteAuth.appAuth,
        'NOTE_TOKEN': noteAuth.noteToken
    };
    try {
        var syncRes = await axios({
            method: 'post',
            url: 'http://mnote.caiyun.feixin.10086.cn/noteServer/api/syncNotebookV3.do',
            headers: noteHeaders,
            data: { addNotebooks: [], delNotebooks: [], notebookRefs: [], updateNotebooks: [] },
            timeout: 15000
        });
        var notebookId = '';
        if (syncRes.data && syncRes.data.notebooks && syncRes.data.notebooks.length > 0) {
            notebookId = syncRes.data.notebooks[0].notebookId;
        }
        if (!notebookId) {
            console.log('获取默认笔记本失败');
            return;
        }
        var noteId = Math.random().toString(16).substring(2, 34) + Math.random().toString(16).substring(2, 18);
        var now = String(Date.now());
        await axios({
            method: 'post',
            url: 'http://mnote.caiyun.feixin.10086.cn/noteServer/api/createNote.do',
            headers: noteHeaders,
            data: {
                archived: 0,
                attachmentdir: noteId,
                attachmentdirid: '',
                attachments: [],
                audioInfo: { audioDuration: 0, audioSize: 0, audioStatus: 0 },
                contentid: '',
                contents: [{
                    contentid: 0,
                    data: '<font size="3">000000</font>',
                    noteId: noteId,
                    sortOrder: 0,
                    type: 'RICHTEXT'
                }],
                cp: '',
                createtime: now,
                description: 'android',
                expands: { noteType: 0 },
                latlng: '',
                location: '',
                noteid: noteId,
                notestatus: 0,
                remindtime: '',
                remindtype: 1,
                revision: '1',
                sharecount: '0',
                sharestatus: '0',
                system: 'mobile',
                tags: [{ id: notebookId, orderIndex: '0', text: '默认笔记本' }],
                title: '00000',
                topmost: '0',
                updatetime: now,
                userphone: currentAccount,
                version: '1.00',
                visitTime: ''
            },
            timeout: 15000
        });
        console.log('创建笔记完成');
    } catch (e) {
        console.log('创建笔记失败: ' + (e.response ? e.response.status : e.message || e));
    }
}

async function processTaskList(marketName, marketKey) {
    var taskList = await getTaskList(marketName);
    await sleep(getRandomWait(1e3, 2e3));
    for (var taskType in taskList) {
        if (taskType === 'new' || taskType === 'hidden' || taskType === 'hiddenabc') continue;
        var tasks = taskList[taskType];
        if (!Array.isArray(tasks)) continue;

        var label = taskType === 'day' ? '每日任务' : taskType === 'month' ? '每月任务' : taskType;
        console.log('\n--- ' + marketKey + ' ' + label + ' ---');

        for (var i = 0; i < tasks.length; i++) {
            var task = tasks[i];
            var taskId = task.id;
            var taskName = task.name || '';
            var taskStatus = task.state || '';

            if (taskStatus === 'FINISH') {
                console.log('  [' + taskName + '] 已完成');
                continue;
            }

            if (shouldSkipTask(taskId, taskType, marketKey)) continue;

            console.log('  [' + taskName + '] 执行中...');
            await clickTask(taskId);

            if (marketKey === 'cloud_app' && taskType === 'day') {
                if (taskId === 106) {
                    await sleep(1e3);
                    await uploadZeroFile();
                } else if (taskId === 107) {
                    await sleep(1e3);
                    await createDefaultNote();
                }
            }

            console.log('  [' + taskName + '] 已点击');
            await sleep(2e3);
        }
    }
}

async function cloudGame() {
    try {
        var data = await sendRequest({
            method: 'get',
            url: 'https://caiyun.feixin.10086.cn/market/signin/hecheng1T/info?op=info',
            headers: JwtHeaders
        });
        var curr = (data && data.result && data.result.info && data.result.info.curr) || 0;
        var rank = (data && data.result && data.result.history && data.result.history[0] && data.result.history[0].rank) || '';
        var count = (data && data.result && data.result.history && data.result.history[0] && data.result.history[0].count) || 0;
        console.log('云朵大作战剩余 ' + curr + ' 次, 排名 ' + rank + ', 合成 ' + count + ' 次');
        for (var i = 0; i < curr; i++) {
            try {
                await sendRequest({
                    method: 'get',
                    url: 'https://caiyun.feixin.10086.cn/market/signin/hecheng1T/beinvite',
                    headers: JwtHeaders
                });
                await sleep(getRandomWait(1e4, 15e3));
                await sendRequest({
                    method: 'get',
                    url: 'https://caiyun.feixin.10086.cn/market/signin/hecheng1T/finish?flag=true',
                    headers: JwtHeaders
                });
                console.log('云朵大作战完成一局');
            } catch (e) {
                console.log('云朵大作战异常: ' + (e.message || e));
            }
        }
        if (curr === 0) {
            console.log('云朵大作战: 今日次数已用完');
        }
    } catch (e) {
        console.log('云朵大作战查询失败: ' + (e.response ? JSON.stringify(e.response.data).substring(0, 200) : e.message || e));
    }
}

async function surplusNum() {
    try {
        var data = await sendRequest({
            method: 'get',
            url: 'https://caiyun.feixin.10086.cn/market/playoffic/drawInfo',
            headers: JwtHeaders
        });
        var surplusNumber = (data && data.result && data.result.surplusNumber) || 0;
        console.log('剩余抽奖次数: ' + surplusNumber);
        if (surplusNumber <= 0) return;
        var drawTimes = Math.min(surplusNumber, 2);
        for (var i = 0; i < drawTimes; i++) {
            try {
                var drawData = await sendRequest({
                    method: 'get',
                    url: 'https://caiyun.feixin.10086.cn/market/playoffic/draw',
                    headers: JwtHeaders
                });
                if (drawData && drawData.code === 0) {
                    console.log('抽奖成功: ' + (drawData.result && drawData.result.prizeName || ''));
                } else {
                    console.log('抽奖失败');
                }
                await sleep(1e3);
            } catch (e) {
                console.log('抽奖异常: ' + (e.message || e));
            }
        }
    } catch (e) {
        console.log('查询抽奖信息失败: ' + (e.response ? JSON.stringify(e.response.data).substring(0, 200) : e.message || e));
    }
}

async function backupCloud() {
    try {
        var data = await sendRequest({
            method: 'get',
            url: 'https://caiyun.feixin.10086.cn/market/backupgift/info',
            headers: JwtHeaders
        });
        var state = (data && data.result && data.result.state);
        if (state === 0) {
            var receiveData = await sendRequest({
                method: 'get',
                url: 'https://caiyun.feixin.10086.cn/market/backupgift/receive',
                headers: JwtHeaders
            });
            console.log('连续备份奖励: ' + ((receiveData && receiveData.result && receiveData.result.result) || '已领取'));
        } else if (state === 1) {
            console.log('本月连续备份奖励已领取');
        }
    } catch (e) {
        console.log('备份奖励查询失败: ' + (e.response ? JSON.stringify(e.response.data).substring(0, 200) : e.message || e));
    }
    await sleep(getRandomWait(1e3, 2e3));
    try {
        var expandData = await sendRequest({
            method: 'get',
            url: 'https://caiyun.feixin.10086.cn/market/signin/page/taskExpansion',
            headers: JwtHeaders
        });
        if (expandData && expandData.result && expandData.result.preMonthBackup && !expandData.result.curMonthBackupTaskAccept) {
            var acceptDate = expandData.result.acceptDate;
            var receiveExpandData = await sendRequest({
                method: 'get',
                url: 'https://caiyun.feixin.10086.cn/market/signin/page/receiveTaskExpansion?acceptDate=' + acceptDate,
                headers: JwtHeaders
            });
            console.log('膨胀云朵领取: ' + ((receiveExpandData && receiveExpandData.result && receiveExpandData.result.cloudCount) || (receiveExpandData && receiveExpandData.msg) || '已领取'));
        }
    } catch (e) {
        console.log('膨胀云朵查询失败: ' + (e.response ? JSON.stringify(e.response.data).substring(0, 200) : e.message || e));
    }
}

async function openSend() {
    try {
        var data = await sendRequest({
            method: 'get',
            url: 'https://caiyun.feixin.10086.cn/market/msgPushOn/task/status',
            headers: JwtHeaders
        });
        if (data && data.result && data.result.pushOn === 1) {
            var types = [1, 2];
            for (var idx = 0; idx < types.length; idx++) {
                var t = types[idx];
                var statusKey = t === 1 ? 'firstTaskStatus' : 'secondTaskStatus';
                var status = data.result[statusKey];
                if (status === 2 || status === 3) {
                    try {
                        var obtainData = await sendRequest({
                            method: 'post',
                            url: 'https://caiyun.feixin.10086.cn/market/msgPushOn/task/obtain',
                            headers: JwtHeaders,
                            data: { type: t }
                        });
                        console.log('通知奖励' + t + ': ' + ((obtainData && obtainData.result && obtainData.result.description) || '已处理'));
                    } catch (e) { }
                }
            }
        } else {
            console.log('通知权限未开启');
        }
    } catch (e) {
        console.log('通知推送查询失败: ' + (e.response ? JSON.stringify(e.response.data).substring(0, 200) : e.message || e));
    }
}

async function receiveClouds() {
    try {
        var data = await sendRequest({
            method: 'get',
            url: 'https://caiyun.feixin.10086.cn/market/signin/page/receive',
            headers: JwtHeaders
        });
        var receive = (data && data.result && data.result.receive) || 0;
        var total = (data && data.result && data.result.total) || 0;
        console.log('当前待领取 ' + receive + ' 云朵, 当前总数 ' + total);
        message += '云朵总数: ' + total + '\n';
    } catch (e) {
        console.log('领取云朵失败: ' + (e.response ? JSON.stringify(e.response.data).substring(0, 200) : e.message || e));
    }
}

async function main(authorization, account, authToken) {
    var encryptAccount = account.substring(0, 3) + '****' + account.substring(7);
    console.log('账号: ' + encryptAccount);
    message += '账号: ' + encryptAccount + '\n';

    currentAuthToken = authToken || '00';

    var authOk = await initAuth(authorization, account);
    if (!authOk) {
        message += '认证失败\n';
        return;
    }

    await sleep(getRandomWait(1e3, 2e3));

    var alreadySigned = await querySignInStatus();
    if (!alreadySigned) {
        await sleep(getRandomWait(1e3, 2e3));
        await signIn();
    }

    await sleep(getRandomWait(1e3, 2e3));
    await doPoke();

    await sleep(getRandomWait(1e3, 2e3));
    await processTaskList('sign_in_3', 'cloud_app');

    await sleep(getRandomWait(1e3, 2e3));
    await cloudGame();

    await sleep(getRandomWait(1e3, 2e3));
    await wxAppSign();

    await sleep(getRandomWait(1e3, 2e3));
    await doShake();

    await sleep(getRandomWait(1e3, 2e3));
    await surplusNum();

    await sleep(getRandomWait(1e3, 2e3));
    await backupCloud();

    await sleep(getRandomWait(1e3, 2e3));
    await openSend();

    await sleep(getRandomWait(1e3, 2e3));
    await processTaskList('newsign_139mail', 'email_app');

    await sleep(getRandomWait(1e3, 2e3));
    await receiveClouds();
}

async function sendNotify(title, msg) {
    try {
        var notify = require('./sendNotify');
        await notify.sendNotify(title, msg);
    } catch (e) {
        try {
            var notify2 = require('../utils/sendNotify');
            await notify2.sendNotify(title, msg);
        } catch (e2) {
            console.log('通知发送失败（sendNotify模块未找到）');
        }
    }
}

!(async () => {
    if (authList.length === 0) {
        console.log('请设置环境变量 CLOUD_DRIVE_AUTH（Basic认证信息）');
        console.log('请设置环境变量 CLOUD_DRIVE_PHONE（手机号）');
        console.log('多个账号用换行或&分隔，AUTH和PHONE一一对应');
        process.exit(1);
    }

    if (phoneList.length === 0) {
        console.log('请设置环境变量 CLOUD_DRIVE_PHONE（手机号）');
        process.exit(1);
    }

    if (authList.length !== phoneList.length) {
        console.log('CLOUD_DRIVE_AUTH和CLOUD_DRIVE_PHONE数量不匹配');
        process.exit(1);
    }

    console.log('## 开始执行... ' + new Date().toLocaleString());

    for (var i = 0; i < authList.length; i++) {
        var index = i + 1;
        var authorization = authList[i].trim();
        var account = phoneList[i].trim();
        var authToken = (authTokenList[i] || '').trim();
        if (!authorization || !account) continue;

        console.log('\n*****第[' + index + ']个移动云盘账号*****');
        message += '📣====移动云盘账号[' + index + ']====📣\n';
        await main(authorization, account, authToken);
        await sleep(getRandomWait(2e3, 3e3));
    }

    if (message) {
        console.log('\n========== 执行结果 ==========');
        console.log(message);
        await sendNotify('移动云盘', message);
    }

    console.log('## 执行结束... ' + new Date().toLocaleString());
})().catch(function (e) {
    console.error('脚本执行异常:', e.message || e);
}).finally(function () {
    process.exit(0);
});
