/**
 * 龙湖天街APP签到（青龙面板版）
 *
 * 环境变量：
 * export LONG_FOR_APP_TOKEN='你的token'    多账号用 & 或换行分隔
 * export LONG_FOR_APP_LOTTERY_ID='抽奖活动ID'  可选，不填则跳过抽奖
 * export LONG_FOR_APP_COMPONENT_NO='抽奖组件ID'  可选，默认CC16D30B58Y4B15D
 *
 * ========== 变量获取方法 ==========
 *
 * 【LONG_FOR_APP_TOKEN】用户登录token（必填）
 *   方法：ADB读取MMKV存储
 *   1. 手机连接电脑，开启ADB：adb connect 192.168.6.127:5555
 *   2. 读取token：
 *      adb shell "su -c 'strings /data/data/com.longfor.supera/files/mmkv/MA_KV_DATA'" | findstr "token"
 *   3. 在输出中找到 "token":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" 的值
 *   注意：token会过期，API返回"登录已过期"时需重新获取
 *
 * 【LONG_FOR_APP_LOTTERY_ID】抽奖活动ID（可选）
 *   含义：标识整个营销活动，如"5月抽奖活动"，一个活动包含多个组件
 *   方法一：从MMKV中提取
 *     adb shell "su -c 'strings /data/data/com.longfor.supera/files/mmkv/MA_KV_DATA'" | findstr "AP26"
 *     找到类似 AP26N042T9O1TTQC 的值
 *   方法二：从H5页面URL提取
 *     在APP中打开抽奖页面，通过ADB获取当前WebView URL：
 *     adb shell "su -c 'dumpsys activity top'" | findstr "llt.longfor.com"
 *     URL格式：https://llt.longfor.com/{活动ID}/PP16330853O5QMLQ/index.html
 *     其中 {活动ID} 就是此变量的值
 *
 * 【LONG_FOR_APP_COMPONENT_NO】抽奖组件ID（可选，默认CC16D30B58Y4B15D）
 *   含义：标识活动中的具体交互组件（如转盘抽奖），一个活动可有多个组件
 *   与活动ID的关系：活动=页面，组件=页面上的功能模块
 *   方法一：从页面info API响应获取
 *     curl -s "https://gw2c-hw-open.longfor.com/llt-gateway-prod/api/v1/page/info?activityNo=你的活动ID&pageNo=PP16330853O5QMLQ" \
 *       -H "authtoken: 你的token" -H "x-gaia-api-key: 2f9e3889-91d9-4684-8ff5-24d881438eaf" \
 *       -H "bucode: L00502" -H "channel: L0"
 *     响应中的 component_no 字段即为组件ID
 *   方法二：从H5页面网络请求中获取
 *     用Chrome DevTools打开抽奖页面，查看任意API请求URL参数中的 component_no
 *
 * cron: 39 8 * * *
 */
const axios = require('axios');
const crypto = require('crypto');

var longForAppList = process.env.LONG_FOR_APP_TOKEN ? process.env.LONG_FOR_APP_TOKEN.split(/[\n&]/) : [];
var message = '';

var baseUrl = 'https://gw2c-hw-open.longfor.com';
var LLT_API_KEY = '2f9e3889-91d9-4684-8ff5-24d881438eaf';
var BU_CODE = 'L00502';
var CHANNEL = 'L0';
var ACTIVITY_NO_LOTTERY = process.env.LONG_FOR_APP_LOTTERY_ID || '';
var COMPONENT_NO_LOTTERY = process.env.LONG_FOR_APP_COMPONENT_NO || 'CC16D30B58Y4B15D';

var MVC_BASE_URL = 'https://gw2c-hw-open.longfor.com/lmarketing-task-api-mvc-prod';
var MVC_LOTTERY_API_KEY = 'c06753f1-3e68-437d-b592-b94656ea5517';
var MVC_TASK_API_KEY = 'caed5282-9019-418d-8854-3c34d02e0b4e';

var SECRET_KEY = '20jtGtg5TQ9V1A3Q4RsxBzJqb@^WUS%m';

var DXRISK_APP_ID = 'd1a43734fc59aeae9f1562dbd70fdf54';
var cachedDxRiskToken = '';

var APP_USER_AGENT = 'com.longfor.supera/1.25.0 Android/13';

var baseHeaders = {
    'User-Agent': APP_USER_AGENT,
    'Content-Type': 'application/json',
    'X-LF-App-Version': '1.25.0',
    'X-LF-Api-Version': 'v1_25_0',
    'X-LF-Bucode': BU_CODE,
    'X-LF-Channel': CHANNEL,
    'X-Client-Type': 'app',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'X-GAIA-API-KEY': '98717e7a-a039-46af-8143-be7558a089c0',
    'utmSource': 'SY',
    'utmMedium': 'L00502',
    'X-Longfor-StoreId': '313',
    'maiaPlatform': 'Android',
    'maiaBrand': 'Xiaomi',
    'maiaModel': 'Mi 10',
    'maiaAppVersion': '1.25.0',
    'maiaOSVersion': '13',
    'maiaAppKey': '6a5ca143d3ff49e79b4cee2dd389bd9d',
    'maiaDeviceId': '8c8a0bd8423113ab',
    'maiaAppBuildVersion': '320423153',
    'maiaScreenSize': '2206*1080'
};

function sortObj(t) {
    var e = [];
    try {
        Object.keys(t).sort().forEach(function (n) {
            var r = t[n];
            if (Array.isArray(r)) {
                var o = "[";
                if (r.length === 0) {
                    o += "]";
                } else {
                    r.forEach(function (t, e) {
                        if (Array.isArray(t)) {
                            o += JSON.stringify(t);
                        } else {
                            o += typeof t === "object" && t !== null ? "{" + sortObj(t) + "}" : t;
                        }
                        o += e < r.length - 1 ? "," : "]";
                    });
                }
                r = o;
            } else if (typeof r === "object" && r !== null) {
                r = "{" + sortObj(r) + "}";
            }
            if (String(r).trim() && String(r) !== "null") {
                e.push(n + "=" + r);
            }
        });
    } catch (t) {
        console.error("拼接字符串错误:", t);
    }
    return e.join("|");
}

function generateSign(data) {
    var n = sortObj(data || {});
    var timestamp = Date.now().toString();
    var i = "";
    if (n) {
        i = n + "&";
    }
    i += timestamp + "&" + SECRET_KEY;
    return {
        "X-LONGZHU-TimeStamp": timestamp,
        "X-Client-Type": "app",
        "X-LONGZHU-Sign": crypto.createHash('md5').update(i).digest('hex')
    };
}

function getUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0;
        var v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    }).toUpperCase();
}

async function getConstId() {
    if (cachedDxRiskToken) return cachedDxRiskToken;
    try {
        var res = await axios.post('https://ly-sta.longhu.net/udid/c1', {
            type: '3',
            version: '2.1.0',
            appId: DXRISK_APP_ID
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Origin': 'https://llt.longfor.com',
                'Referer': 'https://llt.longfor.com/'
            },
            timeout: 10000,
            transformResponse: [function (data) {
                return data;
            }]
        });
        var body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        body = body.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
        var jsonMatch = body.match(/\((\{.*\})\)/);
        if (jsonMatch) {
            var parsed = JSON.parse(jsonMatch[1]);
            if (parsed.data) {
                cachedDxRiskToken = parsed.data;
                console.log('获取DXRisk Token成功: ' + cachedDxRiskToken.substring(0, 20) + '...');
                return cachedDxRiskToken;
            }
        }
        if (res.data && res.data.data && typeof res.data.data === 'string') {
            cachedDxRiskToken = res.data.data;
            console.log('获取DXRisk Token成功: ' + cachedDxRiskToken.substring(0, 20) + '...');
            return cachedDxRiskToken;
        }
        console.log('DXRisk响应: ' + body.substring(0, 300));
    } catch (e) {
        console.log('获取DXRisk Token失败: ' + (e.response ? e.response.status + ' ' + String(e.response.data).substring(0, 200) : e.message || e));
    }
    return '';
}

function prepareBaseHeaders(token, body) {
    var headerCp = JSON.parse(JSON.stringify(baseHeaders));
    headerCp['token'] = token;
    headerCp['lmToken'] = token;
    headerCp['X-LF-RequestId'] = getUUID();
    var signData = generateSign(body);
    headerCp['X-LONGZHU-Sign'] = signData['X-LONGZHU-Sign'];
    headerCp['X-LONGZHU-TimeStamp'] = signData['X-LONGZHU-TimeStamp'];
    return headerCp;
}

function prepareLltHeaders(token) {
    return {
        'Content-Type': 'application/json',
        'authtoken': token,
        'x-gaia-api-key': LLT_API_KEY,
        'bucode': BU_CODE,
        'channel': CHANNEL,
        'cookie': 'token=' + token,
        'origin': 'https://llt.longfor.com',
        'referer': 'https://llt.longfor.com/',
        'user-agent': 'Mozilla/5.0 (Linux; Android 13; Mi 10 Build/TKQ1.221114.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/108.0.5359.128 Mobile Safari/537.36 &MAIAWebKit_android_com.longfor.supera_1.25.0_320423153_Default_3.3.1.4',
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'zh-CN,zh;q=0.9'
    };
}

function prepareMvcHeaders(token, apiKey) {
    var sign = generateSign({});
    return {
        'Content-Type': 'application/json;charset=UTF-8',
        'X-GAIA-API-KEY': apiKey,
        'X-LF-Channel': CHANNEL,
        'X-LF-Bucode': BU_CODE,
        'CASTGC': token,
        'lmToken': token,
        'X-LF-RequestId': getUUID(),
        'X-LONGZHU-Sign': sign['X-LONGZHU-Sign'],
        'X-LONGZHU-TimeStamp': sign['X-LONGZHU-TimeStamp'],
        'X-Client-Type': 'app',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mi 10 Build/TKQ1.221114.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/108.0.5359.128 Mobile Safari/537.36',
        'Origin': 'https://longzhu.longfor.com',
        'Referer': 'https://longzhu.longfor.com/'
    };
}

function getRandomWait(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendRequest(url, method, headers, data) {
    try {
        var config = {
            method: method,
            url: url,
            headers: headers,
            timeout: 15000
        };
        if (method.toLowerCase() === 'post') {
            config.data = data;
        } else {
            config.params = data;
        }
        var response = await axios(config);
        return response.data;
    } catch (e) {
        if (e.response) {
            throw { response: e.response };
        }
        throw e;
    }
}

async function getUserInfo(token) {
    try {
        var headerCp = prepareBaseHeaders(token, {});
        var url = baseUrl + '/supera/member/api/bff/pages/v1_25_0/v1/user-info';
        var data = await sendRequest(url, 'get', headerCp, {});
        if (data && data.data) {
            var name = data.data.nickName || data.data.name || data.data.mobile || '未知用户';
            console.log(name);
            message += name + '\n';
        } else {
            console.log('获取用户信息成功，但数据为空');
        }
    } catch (e) {
        console.error('获取用户信息时发生异常:');
        if (e.response) console.log("服务器返回：", JSON.stringify(e.response.data));
        else console.error(e.message || e);
    }
}

async function sign(token) {
    if (!ACTIVITY_NO_LOTTERY) {
        console.log('未配置抽奖活动ID，跳过签到');
        return;
    }
    var signed = false;
    try {
        var headers = prepareMvcHeaders(token, MVC_TASK_API_KEY);
        var body = {
            "lztoken": token,
            "bucode": BU_CODE,
            "channel": CHANNEL,
            "entranceCode": "",
            "city_code": ""
        };
        var data = await sendRequest(MVC_BASE_URL + '/openapi/task/v1/signs/clock', 'post', headers, body);
        if ('0000' === data.code) {
            console.log('签到成功(MVC)');
            message += '签到成功\n';
            signed = true;
        } else {
            console.log('MVC签到: ' + (data.msg || data.message || JSON.stringify(data)));
        }
    } catch (e) {
        console.log('MVC签到异常: ' + (e.response ? JSON.stringify(e.response.data).substring(0, 200) : e.message || e));
    }
    if (signed) return;
    try {
        var headers2 = prepareLltHeaders(token);
        var body2 = {
            "activity_no": ACTIVITY_NO_LOTTERY,
            "component_no": COMPONENT_NO_LOTTERY,
            "task_type": 10
        };
        var data2 = await sendRequest(baseUrl + '/llt-gateway-prod/api/v1/activity/auth/enroll/sign/submit', 'post', headers2, body2);
        if ('0000' !== data2.code) {
            console.error('签到失败 ->', JSON.stringify(data2));
            message += '签到失败\n';
            return;
        }
        console.log('签到成功(LLT)');
        message += '签到成功\n';
    } catch (e) {
        console.error('签到时发生异常:');
        if (e.response) console.error(JSON.stringify(e.response.data));
        else console.error(e.message || e);
    }
}

async function claimDailyChance(token) {
    if (!ACTIVITY_NO_LOTTERY) return;
    var dxRiskToken = await getConstId();
    try {
        var headers = prepareMvcHeaders(token, MVC_LOTTERY_API_KEY);
        var body = {
            "activity_no": ACTIVITY_NO_LOTTERY,
            "component_no": COMPONENT_NO_LOTTERY,
            "lztoken": token,
            "bucode": BU_CODE,
            "channel": CHANNEL,
            "entranceCode": "",
            "city_code": ""
        };
        var data = await sendRequest(MVC_BASE_URL + '/openapi/task/v1/lottery/sign', 'post', headers, body);
        if ('0000' === data.code) {
            console.log('领取每日抽奖机会成功(MVC)');
            message += '领取每日抽奖机会成功\n';
            return;
        }
        console.log('MVC领取抽奖机会: ' + (data.msg || data.message || JSON.stringify(data)));
    } catch (e) {
        console.log('MVC领取抽奖机会异常: ' + (e.response ? JSON.stringify(e.response.data).substring(0, 200) : e.message || e));
    }
    try {
        var headers2 = prepareLltHeaders(token);
        if (dxRiskToken) {
            headers2['X-LF-DXRisk-Token'] = dxRiskToken;
            headers2['X-LF-DXRisk-Source'] = '1';
            headers2['X-LF-DXRisk-Captcha-Token'] = '';
        }
        var body2 = {
            "activity_no": ACTIVITY_NO_LOTTERY,
            "component_no": COMPONENT_NO_LOTTERY
        };
        var data2 = await sendRequest(baseUrl + '/llt-gateway-prod/api/v1/activity/auth/lottery/sign', 'post', headers2, body2);
        if ('0000' === data2.code) {
            console.log('领取每日抽奖机会成功(LLT)');
            message += '领取每日抽奖机会成功\n';
            return;
        }
        if ('862101' === String(data2.code)) {
            console.log('LLT领取抽奖机会: 风控拦截(DXRisk验证失败)');
        } else if ('862103' === String(data2.code)) {
            console.log('领取每日抽奖机会: 今日已领取或活动限制');
            return;
        } else if ('822001' === String(data2.code)) {
            console.log('领取每日抽奖机会: 登录已过期');
            return;
        } else {
            console.log('LLT领取抽奖机会: ' + (data2.msg || data2.message || JSON.stringify(data2)));
        }
    } catch (e) {
        var errMsg2 = e.message || e;
        if (e.response && e.response.data) {
            try { errMsg2 = JSON.stringify(e.response.data).substring(0, 200); } catch (_) { }
        }
        console.log('LLT领取抽奖机会异常: ' + errMsg2);
    }
    try {
        var headers3 = prepareLltHeaders(token);
        if (dxRiskToken) {
            headers3['X-LF-DXRisk-Token'] = dxRiskToken;
            headers3['X-LF-DXRisk-Source'] = '1';
            headers3['X-LF-DXRisk-Captcha-Token'] = '';
        }
        var body3 = {
            "activity_no": ACTIVITY_NO_LOTTERY,
            "component_no": COMPONENT_NO_LOTTERY,
            "task_type": 10
        };
        var data3 = await sendRequest(baseUrl + '/llt-gateway-prod/api/v1/activity/auth/enroll/sign/receive', 'post', headers3, body3);
        if ('0000' === data3.code) {
            console.log('领取每日抽奖机会成功(LLT-enroll)');
            message += '领取每日抽奖机会成功\n';
            return;
        }
        console.log('LLT-enroll领取抽奖机会: ' + (data3.msg || JSON.stringify(data3)));
    } catch (e) {
        var errMsg = e.message || e;
        if (e.response && e.response.data) {
            try { errMsg = JSON.stringify(e.response.data).substring(0, 200); } catch (_) { }
        }
        console.log('LLT-enroll领取抽奖机会异常: ' + errMsg);
    }
}

async function getLotteryChance(token) {
    if (!ACTIVITY_NO_LOTTERY) return 0;
    var dxRiskToken = await getConstId();
    try {
        var headers = prepareMvcHeaders(token, MVC_LOTTERY_API_KEY);
        var params = {
            activity_no: ACTIVITY_NO_LOTTERY,
            component_no: COMPONENT_NO_LOTTERY
        };
        var data = await sendRequest(MVC_BASE_URL + '/openapi/task/v1/lottery/ticket-times', 'get', headers, params);
        if ('0000' === data.code && data.data) {
            var chance = data.data.free_num || data.data.chance || data.data.ticket_times || data.data.times || 0;
            if (chance > 0) return chance;
        }
    } catch (e) {
    }
    try {
        var headers2 = prepareLltHeaders(token);
        if (dxRiskToken) {
            headers2['X-LF-DXRisk-Token'] = dxRiskToken;
            headers2['X-LF-DXRisk-Source'] = '1';
            headers2['X-LF-DXRisk-Captcha-Token'] = '';
        }
        var params2 = {
            activity_no: ACTIVITY_NO_LOTTERY,
            component_no: COMPONENT_NO_LOTTERY
        };
        var data2 = await sendRequest(baseUrl + '/llt-gateway-prod/api/v1/activity/auth/lottery/chance', 'get', headers2, params2);
        if ('0000' === data2.code && data2.data) {
            return data2.data.chance || data2.data.free_num || data2.data.times || 0;
        }
    } catch (e) {
    }
    return 0;
}

async function lottery(token) {
    if (!ACTIVITY_NO_LOTTERY) {
        console.log('未配置抽奖活动ID，跳过抽奖');
        return;
    }
    var dxRiskToken = await getConstId();
    var chance = await getLotteryChance(token);
    if (chance <= 0) {
        console.log('当前无抽奖机会');
        message += '当前无抽奖机会\n';
        return;
    }
    console.log('当前有' + chance + '次抽奖机会');
    var maxRetry = Math.min(chance, 5);
    for (var i = 0; i < maxRetry; i++) {
        var drawn = false;
        try {
            var headers = prepareMvcHeaders(token, MVC_LOTTERY_API_KEY);
            var body = {
                "activity_no": ACTIVITY_NO_LOTTERY,
                "component_no": COMPONENT_NO_LOTTERY,
                "lztoken": token,
                "bucode": BU_CODE,
                "channel": CHANNEL,
                "entranceCode": "",
                "city_code": ""
            };
            var data = await sendRequest(MVC_BASE_URL + '/openapi/task/v1/lottery/luck', 'post', headers, body);
            if ('0000' === data.code) {
                var prizeName = data.data && data.data.prize_name ? data.data.prize_name : '未知奖品';
                var remark = data.data && data.data.remark ? data.data.remark : '';
                console.log('第' + (i + 1) + '次抽奖成功(MVC)，获得: ' + prizeName + (remark ? ' (' + remark + ')' : ''));
                message += '第' + (i + 1) + '次抽奖成功，获得: ' + prizeName + '\n';
                drawn = true;
            }
        } catch (e) {
        }
        if (!drawn) {
            try {
                var headers2 = prepareLltHeaders(token);
                if (dxRiskToken) {
                    headers2['X-LF-DXRisk-Token'] = dxRiskToken;
                    headers2['X-LF-DXRisk-Source'] = '1';
                    headers2['X-LF-DXRisk-Captcha-Token'] = '';
                }
                var body2 = {
                    "activity_no": ACTIVITY_NO_LOTTERY,
                    "component_no": COMPONENT_NO_LOTTERY
                };
                var data2 = await sendRequest(baseUrl + '/llt-gateway-prod/api/v1/activity/auth/lottery/click', 'post', headers2, body2);
                if ('0000' !== data2.code) {
                    if ('862101' === String(data2.code)) {
                        console.error('第' + (i + 1) + '次抽奖被风控拦截，请检查DXRisk Token');
                    } else if ('822001' === String(data2.code)) {
                        console.error('第' + (i + 1) + '次抽奖失败: 登录已过期');
                    } else {
                        console.error('第' + (i + 1) + '次抽奖失败:', JSON.stringify(data2));
                    }
                    break;
                }
                var prizeName2 = data2.data && data2.data.prize_name ? data2.data.prize_name : '未知奖品';
                var remark2 = data2.data && data2.data.remark ? data2.data.remark : '';
                console.log('第' + (i + 1) + '次抽奖成功(LLT)，获得: ' + prizeName2 + (remark2 ? ' (' + remark2 + ')' : ''));
                message += '第' + (i + 1) + '次抽奖成功，获得: ' + prizeName2 + '\n';
            } catch (e2) {
                console.error('第' + (i + 1) + '次抽奖异常:');
                if (e2.response) console.error(JSON.stringify(e2.response.data));
                else console.error(e2.message || e2);
                break;
            }
        }
        await sleep(getRandomWait(2e3, 4e3));
    }
}

async function main(token) {
    await getUserInfo(token);
    await sleep(getRandomWait(1e3, 2e3));
    await sign(token);
    await sleep(getRandomWait(1e3, 2e3));
    await claimDailyChance(token);
    await sleep(getRandomWait(1e3, 2e3));
    await lottery(token);
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
    if (longForAppList.length === 0) {
        console.log('请设置环境变量 LONG_FOR_APP_TOKEN，多个token用换行或&分隔');
        console.log('可选: LONG_FOR_APP_LOTTERY_ID=抽奖活动ID');
        console.log('可选: LONG_FOR_APP_COMPONENT_NO=抽奖组件ID');
        process.exit(1);
    }

    console.log('## 开始执行... ' + new Date().toLocaleString());

    for (var i = 0; i < longForAppList.length; i++) {
        var index = i + 1;
        var token = longForAppList[i].trim();
        if (!token) continue;
        console.log('\n*****第[' + index + ']个龙湖天街APP账号*****');
        message += '📣====龙湖天街APP账号[' + index + ']====📣\n';
        await main(token);
        await sleep(getRandomWait(2e3, 3e3));
    }

    if (message) {
        console.log('\n========== 执行结果 ==========');
        console.log(message);
        await sendNotify('龙湖天街APP', message);
    }

    console.log('## 执行结束... ' + new Date().toLocaleString());
})().catch(function (e) {
    console.error('脚本执行异常:', e.message || e);
}).finally(function () {
    process.exit(0);
});
