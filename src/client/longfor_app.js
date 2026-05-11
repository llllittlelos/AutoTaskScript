/**
 * 龙湖天街APP签到（青龙面板版）
 *
 * 抓包方式：手机安装PCAPdroid（免Root抓包，不走WiFi代理，APP检测不到）
 *   或用Frida + r0capture抓包
 * 打开龙湖天街APP，操作一下，找到请求头中的 token 值
 *
 * 环境变量：
 * export LONG_FOR_APP_TOKEN='你的token'    多账号用 & 或换行分隔
 * export LONG_FOR_APP_DX_TOKEN='你的X-LF-DXRisk-Token值'  可选，风控token
 * export LONG_FOR_APP_LOTTERY_ID='抽奖活动ID'  可选，不填则跳过抽奖
 *
 * cron: 39 8 * * *
 */
const axios = require('axios');
const crypto = require('crypto');

var longForAppList = process.env.LONG_FOR_APP_TOKEN ? process.env.LONG_FOR_APP_TOKEN.split(/[\n&]/) : [];
var dxRiskToken = process.env.LONG_FOR_APP_DX_TOKEN || '';
var message = '';

var baseUrl = 'https://gw2c-hw-open.longfor.com';
var API_KEY = 'c06753f1-3e68-437d-b592-b94656ea5517';
var BU_CODE = 'L00502';
var DX_RISK_SOURCE = 1;
var CHANNEL = 'L0';
var ACTIVITY_NO_SIGN = process.env.LONG_FOR_APP_SIGN_ID || '11111111111686241863606037740000';
var ACTIVITY_NO_LOTTERY = process.env.LONG_FOR_APP_LOTTERY_ID || '';

var SECRET_KEY = '20jtGtg5TQ9V1A3Q4RsxBzJqb@^WUS%m';

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

function prepareHeaders(token, body) {
    var headerCp = JSON.parse(JSON.stringify(baseHeaders));
    delete headerCp['X-GAIA-API-KEY'];
    headerCp['token'] = token;
    headerCp['X-GAIA-API-KEY'] = API_KEY;
    headerCp['X-LF-UserToken'] = token;
    headerCp['X-LF-Bu-Code'] = BU_CODE;
    headerCp['X-LF-DXRisk-Source'] = String(DX_RISK_SOURCE);
    headerCp['X-LF-DXRisk-Captcha-Token'] = 'undefined';
    if (dxRiskToken) {
        headerCp['X-LF-DXRisk-Token'] = dxRiskToken;
    }
    headerCp['X-LF-Channel'] = CHANNEL;
    headerCp['Accept'] = 'application/json, text/plain, */*';
    headerCp['X-LF-RequestId'] = getUUID();
    headerCp['Origin'] = 'https://longzhu.longfor.com';
    headerCp['Referer'] = 'https://longzhu.longfor.com/';
    headerCp['X-Requested-With'] = 'com.longfor.supera';
    headerCp['User-Agent'] = 'Mozilla/5.0 (Linux; Android 13; Mi 10 Build/TKQ1.221114.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/108.0.5359.128 Mobile Safari/537.36 &MAIAWebKit_android_com.longfor.supera_1.25.0_320423153_Default_3.3.1.4';
    headerCp['Content-Type'] = 'application/json;charset=UTF-8';
    var signData = generateSign(body);
    headerCp['X-LONGZHU-Sign'] = signData['X-LONGZHU-Sign'];
    headerCp['X-LONGZHU-TimeStamp'] = signData['X-LONGZHU-TimeStamp'];
    return headerCp;
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

async function initKey(token) {
    try {
        var body = {};
        var headerCp = prepareBaseHeaders(token, body);
        var url = baseUrl + '/supera/mine/v1_25_0/token/token2key';
        var data = await sendRequest(url, 'post', headerCp, body);
        if (data && data.data && data.data.key) {
            console.log('获取disposableKey成功: ' + data.data.key);
            return data.data.key;
        }
        console.log('获取disposableKey失败: ' + JSON.stringify(data));
        return '';
    } catch (e) {
        console.error('token2key接口调用失败:');
        if (e.response) console.error(JSON.stringify(e.response.data));
        else console.error(e.message || e);
        return '';
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

async function sign(token, disposableKey) {
    try {
        var body = {
            "activity_no": ACTIVITY_NO_SIGN
        };
        if (disposableKey) {
            body.disposableKey = disposableKey;
        }
        var data = await sendRequest(baseUrl + '/lmarketing-task-api-mvc-prod/openapi/task/v1/signature/clock', 'post', prepareHeaders(token, body), body);
        if ('0000' !== data.code) {
            return console.error('签到失败 ->', JSON.stringify(data));
        }
        if (data.data.is_popup === 1) {
            console.log('签到成功！成长值+' + data.data.reward_info[0].reward_num);
            message += '签到成功！成长值+' + data.data.reward_info[0].reward_num + '\n';
        } else {
            console.log('今日已签到');
            message += '今日已签到\n';
        }
    } catch (e) {
        console.error('签到时发生异常:');
        if (e.response) console.error(JSON.stringify(e.response.data));
        else console.error(e.message || e);
    }
}

async function lotterySign(token, disposableKey) {
    if (!ACTIVITY_NO_LOTTERY) {
        console.log('未配置抽奖活动ID，跳过抽奖签到');
        return;
    }
    try {
        var body = {
            "activity_no": ACTIVITY_NO_LOTTERY,
            "task_id": ""
        };
        if (disposableKey) {
            body.disposableKey = disposableKey;
        }
        var data = await sendRequest(baseUrl + '/lmarketing-task-api-mvc-prod/openapi/task/v1/lottery/sign', 'post', prepareHeaders(token, body), body);
        if ('0000' !== data.code) {
            return console.error('抽奖签到失败 ->', JSON.stringify(data));
        }
        console.log('抽奖签到成功，获得' + data.data.ticket_times + '次抽奖机会');
        message += '抽奖签到成功\n';
    } catch (e) {
        console.error('抽奖签到时发生异常:');
        if (e.response) console.error(JSON.stringify(e.response.data));
        else console.error(e.message || e);
    }
}

async function lottery(token, disposableKey) {
    if (!ACTIVITY_NO_LOTTERY) {
        console.log('未配置抽奖活动ID，跳过抽奖');
        return;
    }
    var maxRetry = 5;
    for (var i = 0; i < maxRetry; i++) {
        try {
            var body = {
                "activity_no": ACTIVITY_NO_LOTTERY,
                "task_id": ""
            };
            if (disposableKey) {
                body.disposableKey = disposableKey;
            }
            var data = await sendRequest(baseUrl + '/lmarketing-task-api-mvc-prod/openapi/task/v1/lottery/luck', 'post', prepareHeaders(token, body), body);
            if ('0000' !== data.code) {
                console.error('第' + (i + 1) + '次抽奖失败:', JSON.stringify(data));
                break;
            }
            console.log('第' + (i + 1) + '次抽奖成功，获得' + data.data.desc);
            message += '第' + (i + 1) + '次抽奖成功，获得' + data.data.desc + '\n';
            await sleep(getRandomWait(2e3, 4e3));
        } catch (e) {
            console.error('第' + (i + 1) + '次抽奖异常:');
            if (e.response) console.error(JSON.stringify(e.response.data));
            else console.error(e.message || e);
            break;
        }
    }
}

async function main(token) {
    var disposableKey = await initKey(token);
    await sleep(getRandomWait(1e3, 2e3));
    await getUserInfo(token);
    await sleep(getRandomWait(1e3, 2e3));
    await sign(token, disposableKey);
    await sleep(getRandomWait(1e3, 2e3));
    await lotterySign(token, disposableKey);
    await sleep(getRandomWait(1e3, 2e3));
    await lottery(token, disposableKey);
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
        console.log('可选: LONG_FOR_APP_DX_TOKEN=风控token');
        console.log('可选: LONG_FOR_APP_LOTTERY_ID=抽奖活动ID');
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
