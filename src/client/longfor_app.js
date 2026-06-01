/**
 * 龙湖天街APP 签到+任务+抽奖（青龙面板版）
 *
 * 环境变量：
 * export LONG_FOR_APP_TOKEN='你的token'    多账号用 & 或换行分隔
 * export LONG_FOR_APP_LOTTERY_ID='抽奖活动ID'  可选，不填则自动发现
 * export LONG_FOR_APP_COMPONENT_NO='抽奖组件ID'  可选，不填则自动发现
 * export LONG_FOR_APP_SIGN_ID='签到活动ID'  可选，默认内置
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
 * 【LONG_FOR_APP_LOTTERY_ID】抽奖活动ID（可选，不填则自动发现）
 *   含义：标识整个营销活动，如"5月抽奖活动"，一个活动包含多个组件
 *   方法一：从MMKV中提取
 *     adb shell "su -c 'strings /data/data/com.longfor.supera/files/mmkv/MA_KV_DATA'" | findstr "AP26"
 *   方法二：从H5页面URL提取
 *     URL格式：https://llt.longfor.com/{活动ID}/PP16330853O5QMLQ/index.html
 *
 * 【LONG_FOR_APP_COMPONENT_NO】抽奖组件ID（可选，不填则自动发现）
 *   含义：标识活动中的具体交互组件（如转盘抽奖）
 *   不填时会通过page/info API自动获取
 *
 * cron: 39 8 * * *
 */
const axios = require('axios');
const crypto = require('crypto');

var longForAppList = process.env.LONG_FOR_APP_TOKEN ? process.env.LONG_FOR_APP_TOKEN.split(/[\n&]/).filter(function(t) { return t.trim(); }) : [];
var message = '';

var baseUrl = 'https://gw2c-hw-open.longfor.com';
var LLT_API_KEY = '2f9e3889-91d9-4684-8ff5-24d881438eaf';
var BU_CODE = 'L00502';
var CHANNEL = 'L0';
var ACTIVITY_NO_LOTTERY = process.env.LONG_FOR_APP_LOTTERY_ID || '';
var ACTIVITY_NO_SIGN = process.env.LONG_FOR_APP_SIGN_ID || '11111111111686241863606037740000';
var COMPONENT_NO_LOTTERY = process.env.LONG_FOR_APP_COMPONENT_NO || '';

var MVC_BASE_URL = 'https://gw2c-hw-open.longfor.com/lmarketing-task-api-mvc-prod';
var MVC_LOTTERY_API_KEY = 'c06753f1-3e68-437d-b592-b94656ea5517';
var MVC_TASK_API_KEY = 'caed5282-9019-418d-8854-3c34d02e0b4e';

var SECRET_KEY = '20jtGtg5TQ9V1A3Q4RsxBzJqb@^WUS%m';
var SECRET_KEY_MICRO = 'Q74eKtH5LePYfSjIiflUbCL2gxjTa7rF';

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
    }
    return e.join("|");
}

function generateSign(data) {
    var n = sortObj(data || {});
    var timestamp = Date.now().toString();
    var i = n ? n + "&" : "";
    i += timestamp + "&" + SECRET_KEY;
    return {
        "X-LONGZHU-TimeStamp": timestamp,
        "X-Client-Type": "app",
        "X-LONGZHU-Sign": crypto.createHash('md5').update(i).digest('hex')
    };
}

function generateSignMicro(data) {
    var n = sortObj(data || {});
    var timestamp = Date.now().toString();
    var i = n ? n + "&" : "";
    i += timestamp + "&" + SECRET_KEY_MICRO;
    return {
        "X-LONGZHU-TimeStamp": timestamp,
        "X-Client-Type": "microApp",
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

function getRandomWait(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendRequest(url, method, headers, data, timeout) {
    try {
        var config = {
            method: method,
            url: url,
            headers: headers,
            timeout: timeout || 20000
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

function prepareMvcHeaders(token, body) {
    var headerCp = JSON.parse(JSON.stringify(baseHeaders));
    headerCp['token'] = token;
    headerCp['lmToken'] = token;
    headerCp['X-Gaia-Api-Key'] = MVC_LOTTERY_API_KEY;
    headerCp['X-LF-UserToken'] = token;
    headerCp['X-LF-Bu-Code'] = 'C20400';
    headerCp['X-LF-DXRisk-Source'] = '5';
    headerCp['X-LF-DXRisk-Captcha-Token'] = 'undefined';
    headerCp['X-LF-Channel'] = 'C2';
    headerCp['X-LF-RequestId'] = getUUID();
    var signData = generateSignMicro(body || {});
    headerCp['X-LONGZHU-Sign'] = signData['X-LONGZHU-Sign'];
    headerCp['X-LONGZHU-TimeStamp'] = signData['X-LONGZHU-TimeStamp'];
    return headerCp;
}

async function getConstId() {
    if (cachedDxRiskToken) return cachedDxRiskToken;
    for (var attempt = 0; attempt < 3; attempt++) {
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
                timeout: 15000,
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
                    console.log('✅ DXRisk Token获取成功');
                    return cachedDxRiskToken;
                }
            }
            if (res.data && res.data.data && typeof res.data.data === 'string') {
                cachedDxRiskToken = res.data.data;
                console.log('✅ DXRisk Token获取成功');
                return cachedDxRiskToken;
            }
            console.log('⚠️ DXRisk响应异常(重试' + (attempt + 1) + '/3): ' + body.substring(0, 200));
        } catch (e) {
            console.log('⚠️ DXRisk获取失败(重试' + (attempt + 1) + '/3): ' + (e.message || e));
        }
        if (attempt < 2) await sleep(2000);
    }
    console.log('❌ DXRisk Token获取失败，抽奖可能被风控拦截');
    return '';
}

async function getUserInfo(token) {
    try {
        var headerCp = prepareBaseHeaders(token, {});
        var url = baseUrl + '/supera/member/api/bff/pages/v1_25_0/v1/user-info';
        var data = await sendRequest(url, 'get', headerCp, {});
        if (data && data.data) {
            var name = data.data.nickName || data.data.name || data.data.mobile || '未知用户';
            var level = data.data.levelName || data.data.memberLevelName || '';
            console.log('👤 用户: ' + name + (level ? ' (' + level + ')' : ''));
            message += name + '\n';
            return name;
        } else {
            console.log('⚠️ 获取用户信息成功，但数据为空');
        }
    } catch (e) {
        if (e.response) {
            var errData = e.response.data || {};
            if ('822001' === String(errData.code) || (errData.msg && errData.msg.includes('过期'))) {
                console.log('❌ Token已过期，请重新获取');
                message += 'Token已过期\n';
                return null;
            }
            console.log('❌ 获取用户信息失败: ' + JSON.stringify(errData).substring(0, 200));
        } else {
            console.log('❌ 获取用户信息异常: ' + (e.message || e));
        }
    }
    return null;
}

async function getDisposableKey(token) {
    try {
        var headers = prepareBaseHeaders(token, {});
        var url = baseUrl + '/supera/mine/v1_25_0/token/token2key';
        var data = await sendRequest(url, 'post', headers, {});
        if (data && data.data && data.data.key) {
            console.log('✅ disposableKey获取成功');
            return data.data.key;
        }
        console.log('⚠️ disposableKey获取失败: ' + JSON.stringify(data).substring(0, 200));
    } catch (e) {
        console.log('⚠️ disposableKey获取异常: ' + (e.response ? JSON.stringify(e.response.data).substring(0, 200) : e.message || e));
    }
    return '';
}

async function signMvc(token, disposableKey) {
    if (!ACTIVITY_NO_SIGN) return false;
    try {
        var body = { "activity_no": ACTIVITY_NO_SIGN };
        if (disposableKey) body.disposableKey = disposableKey;
        var headers = prepareMvcHeaders(token, body);
        var data = await sendRequest(MVC_BASE_URL + '/openapi/task/v1/signature/clock', 'post', headers, body);
        if ('0000' === data.code) {
            if (data.data && data.data.is_popup === 1) {
                var reward = data.data.reward_info && data.data.reward_info[0] ? data.data.reward_info[0].reward_num : '';
                console.log('✅ 签到成功(MVC)！成长值+' + reward);
            } else {
                console.log('✅ 今日已签到(MVC)');
            }
            message += '签到成功\n';
            return true;
        }
        console.log('⚠️ MVC签到: ' + (data.msg || data.message || JSON.stringify(data)));
    } catch (e) {
        console.log('⚠️ MVC签到异常: ' + (e.response ? JSON.stringify(e.response.data).substring(0, 200) : e.message || e));
    }
    return false;
}

async function signLlt(token) {
    if (!ACTIVITY_NO_LOTTERY) return false;
    try {
        var headers = prepareLltHeaders(token);
        var body = {
            "activity_no": ACTIVITY_NO_LOTTERY,
            "component_no": COMPONENT_NO_LOTTERY,
            "task_type": 10
        };
        var data = await sendRequest(baseUrl + '/llt-gateway-prod/api/v1/activity/auth/enroll/sign/submit', 'post', headers, body);
        if ('0000' === data.code) {
            console.log('✅ 签到成功(LLT)');
            message += '签到成功(LLT)\n';
            return true;
        }
        if ('822001' === String(data.code)) {
            console.log('❌ LLT签到: 登录已过期');
            return false;
        }
        console.log('⚠️ LLT签到: ' + (data.msg || data.message || JSON.stringify(data)));
    } catch (e) {
        console.log('⚠️ LLT签到异常: ' + (e.response ? JSON.stringify(e.response.data).substring(0, 200) : e.message || e));
    }
    return false;
}

async function sign(token, disposableKey) {
    console.log('\n📋 === 签到 ===');
    var signed = await signMvc(token, disposableKey);
    if (!signed) {
        signed = await signLlt(token);
    }
    if (!signed) {
        console.log('⚠️ 所有签到方式均未成功');
        message += '签到失败\n';
    }
    return signed;
}

async function discoverLotteryActivity(token) {
    if (ACTIVITY_NO_LOTTERY && COMPONENT_NO_LOTTERY) return true;

    console.log('🔍 自动发现抽奖活动...');
    var knownActivityNos = ['AP26N042T9O1TTQC'];
    var pageNos = ['PP16330853O5QMLQ'];

    for (var actNo of knownActivityNos) {
        for (var pageNo of pageNos) {
            try {
                var headers = prepareLltHeaders(token);
                var data = await sendRequest(baseUrl + '/llt-gateway-prod/api/v1/page/info', 'get', headers, {
                    activityNo: actNo,
                    pageNo: pageNo
                });
                if (data.code !== '0000' || !data.data) continue;

                var info = data.data;
                var componentList = info.componentList || info.component_list || [];

                if (info.info && typeof info.info === 'string') {
                    try {
                        var infoObj = JSON.parse(info.info);
                        if (infoObj.list) componentList = componentList.concat(infoObj.list);
                    } catch (_) {}
                }

                for (var comp of componentList) {
                    var compData = comp.data || comp;
                    var compNo = compData.component_no || comp.componentNo || comp.component_no || '';
                    var comName = comp.comName || comp.type || '';
                    var setting = compData.setting || compData.base_rule || comp.setting || {};
                    if (typeof setting === 'string') {
                        try { setting = JSON.parse(setting); } catch (_) { continue; }
                    }

                    var isLottery = comName === 'turntablecom'
                        || (setting.is_free !== undefined)
                        || (setting.luckUrl)
                        || (compData.is_active !== undefined)
                        || (setting.user_day_free_num !== undefined);

                    if (isLottery) {
                        if (!ACTIVITY_NO_LOTTERY) {
                            ACTIVITY_NO_LOTTERY = actNo;
                            console.log('🎯 发现活动ID: ' + actNo);
                        }
                        if (!COMPONENT_NO_LOTTERY) {
                            COMPONENT_NO_LOTTERY = compNo;
                            console.log('🎯 发现组件ID: ' + compNo + ' (' + comName + ')');
                        }
                        if (ACTIVITY_NO_LOTTERY && COMPONENT_NO_LOTTERY) return true;
                    }
                }
            } catch (e) {
            }
        }
    }

    if (!ACTIVITY_NO_LOTTERY || !COMPONENT_NO_LOTTERY) {
        console.log('⚠️ 未自动发现抽奖活动，请手动配置LONG_FOR_APP_LOTTERY_ID和LONG_FOR_APP_COMPONENT_NO');
        return false;
    }
    return true;
}

async function getTaskList(token) {
    if (!ACTIVITY_NO_LOTTERY) return [];
    try {
        var headers = prepareLltHeaders(token);
        var data = await sendRequest(baseUrl + '/llt-gateway-prod/api/v1/activity/auth/task/list', 'get', headers, {
            activity_no: ACTIVITY_NO_LOTTERY,
            component_no: COMPONENT_NO_LOTTERY
        });
        if (data.code === '0000' && data.data) {
            return data.data.task_list || data.data || [];
        }
    } catch (e) {
    }
    return [];
}

async function getEnrollTaskList(token) {
    if (!ACTIVITY_NO_LOTTERY) return [];
    try {
        var headers = prepareLltHeaders(token);
        var data = await sendRequest(baseUrl + '/llt-gateway-prod/api/v1/activity/auth/enroll/task/list', 'get', headers, {
            activity_no: ACTIVITY_NO_LOTTERY,
            component_no: COMPONENT_NO_LOTTERY
        });
        if (data.code === '0000' && data.data) {
            return data.data.task_list || data.data || [];
        }
    } catch (e) {
    }
    return [];
}

async function doEnrollTask(token, taskType) {
    if (!ACTIVITY_NO_LOTTERY) return false;
    var dxRiskToken = await getConstId();
    try {
        var headers = prepareLltHeaders(token);
        if (dxRiskToken) {
            headers['X-LF-DXRisk-Token'] = dxRiskToken;
            headers['X-LF-DXRisk-Source'] = '1';
            headers['X-LF-DXRisk-Captcha-Token'] = '';
        }
        var body = {
            "activity_no": ACTIVITY_NO_LOTTERY,
            "component_no": COMPONENT_NO_LOTTERY,
            "task_type": taskType
        };
        var data = await sendRequest(baseUrl + '/llt-gateway-prod/api/v1/activity/auth/enroll/sign/receive', 'post', headers, body);
        if (data.code === '0000') {
            return true;
        }
        console.log('⚠️ 任务领取(task_type=' + taskType + '): ' + (data.msg || data.message || JSON.stringify(data)));
    } catch (e) {
        console.log('⚠️ 任务领取异常(task_type=' + taskType + '): ' + (e.response ? JSON.stringify(e.response.data).substring(0, 200) : e.message || e));
    }
    return false;
}

async function doTasks(token) {
    if (!ACTIVITY_NO_LOTTERY) return;
    console.log('\n📋 === 日常任务 ===');

    var taskList = await getTaskList(token);
    var enrollTaskList = await getEnrollTaskList(token);
    var allTasks = [].concat(taskList, enrollTaskList);

    if (allTasks.length === 0) {
        console.log('📋 未获取到任务列表');
        return;
    }

    console.log('📋 任务列表 (' + allTasks.length + '个):');
    var completedCount = 0;
    for (var task of allTasks) {
        var taskName = task.task_name || task.taskName || '未知';
        var taskType = task.task_type || task.taskType || 0;
        var status = task.status || task.state || 0;
        var isComplete = task.is_complete || task.isComplete || status === 2 || status === 'complete';

        var statusStr = isComplete ? '✅已完成' : '⏳未完成';
        console.log('  ' + taskName + ' (type=' + taskType + '): ' + statusStr);

        if (!isComplete && taskType) {
            var result = await doEnrollTask(token, taskType);
            if (result) {
                console.log('  ✅ ' + taskName + ' 领取成功');
                completedCount++;
            }
            await sleep(getRandomWait(1000, 3000));
        }
    }

    if (completedCount > 0) {
        console.log('📋 完成 ' + completedCount + ' 个任务');
        message += '完成任务' + completedCount + '个\n';
    }
}

async function claimDailyChance(token) {
    if (!ACTIVITY_NO_LOTTERY) return;
    console.log('\n🎁 === 领取每日抽奖机会 ===');

    var dxRiskToken = await getConstId();

    var endpoints = [
        {
            name: 'LLT lottery/sign',
            url: baseUrl + '/llt-gateway-prod/api/v1/activity/auth/lottery/sign',
            body: { activity_no: ACTIVITY_NO_LOTTERY, component_no: COMPONENT_NO_LOTTERY }
        },
        {
            name: 'LLT enroll/sign/receive',
            url: baseUrl + '/llt-gateway-prod/api/v1/activity/auth/enroll/sign/receive',
            body: { activity_no: ACTIVITY_NO_LOTTERY, component_no: COMPONENT_NO_LOTTERY, task_type: 10 }
        },
        {
            name: 'LLT lottery/task/sign',
            url: baseUrl + '/llt-gateway-prod/api/v1/activity/auth/lottery/task/sign',
            body: { activity_no: ACTIVITY_NO_LOTTERY, component_no: COMPONENT_NO_LOTTERY }
        }
    ];

    for (var ep of endpoints) {
        try {
            var headers = prepareLltHeaders(token);
            if (dxRiskToken) {
                headers['X-LF-DXRisk-Token'] = dxRiskToken;
                headers['X-LF-DXRisk-Source'] = '1';
                headers['X-LF-DXRisk-Captcha-Token'] = '';
            }
            var data = await sendRequest(ep.url, 'post', headers, ep.body);
            if (data.code === '0000') {
                console.log('✅ ' + ep.name + ': 领取成功');
                message += '领取抽奖机会成功\n';
                await sleep(getRandomWait(1000, 2000));
                continue;
            }
            if ('822001' === String(data.code)) {
                console.log('❌ ' + ep.name + ': 登录已过期');
                return;
            }
            if ('862103' === String(data.code)) {
                console.log('⚠️ ' + ep.name + ': 活动太火爆');
                return;
            }
            console.log('⚠️ ' + ep.name + ': ' + (data.msg || data.message || JSON.stringify(data)));
        } catch (e) {
            console.log('⚠️ ' + ep.name + '异常: ' + (e.response ? JSON.stringify(e.response.data).substring(0, 200) : e.message || e));
        }
        await sleep(getRandomWait(1000, 2000));
    }

    try {
        var mvcBody = { activity_no: ACTIVITY_NO_LOTTERY, component_no: COMPONENT_NO_LOTTERY };
        var mvcHeaders = prepareMvcHeaders(token, mvcBody);
        var mvcData = await sendRequest(MVC_BASE_URL + '/openapi/task/v1/lottery/sign', 'post', mvcHeaders, mvcBody);
        if (mvcData.code === '0000') {
            console.log('✅ MVC lottery/sign: 领取成功');
            message += '领取抽奖机会成功(MVC)\n';
        } else {
            console.log('⚠️ MVC lottery/sign: ' + (mvcData.msg || mvcData.message || JSON.stringify(mvcData)));
        }
    } catch (e) {
        console.log('⚠️ MVC lottery/sign异常: ' + (e.response ? JSON.stringify(e.response.data).substring(0, 200) : e.message || e));
    }
}

async function getLotteryChance(token) {
    if (!ACTIVITY_NO_LOTTERY) return 0;
    var dxRiskToken = await getConstId();
    try {
        var headers = prepareLltHeaders(token);
        if (dxRiskToken) {
            headers['X-LF-DXRisk-Token'] = dxRiskToken;
            headers['X-LF-DXRisk-Source'] = '1';
            headers['X-LF-DXRisk-Captcha-Token'] = '';
        }
        var data = await sendRequest(baseUrl + '/llt-gateway-prod/api/v1/activity/auth/lottery/chance', 'get', headers, {
            activity_no: ACTIVITY_NO_LOTTERY,
            component_no: COMPONENT_NO_LOTTERY
        });
        if (data.code === '0000' && data.data) {
            return data.data.chance || data.data.free_num || data.data.times || 0;
        }
    } catch (e) {
    }
    return 0;
}

async function lottery(token) {
    if (!ACTIVITY_NO_LOTTERY) {
        console.log('\n🎰 未配置抽奖活动ID，跳过抽奖');
        return;
    }

    console.log('\n🎰 === 抽奖 ===');
    var dxRiskToken = await getConstId();
    var chance = await getLotteryChance(token);

    if (chance <= 0) {
        console.log('🎰 当前无抽奖机会');
        message += '无抽奖机会\n';
        return;
    }

    console.log('🎰 当前有 ' + chance + ' 次抽奖机会');
    var maxRetry = Math.min(chance, 10);
    var successCount = 0;

    for (var i = 0; i < maxRetry; i++) {
        try {
            var headers = prepareLltHeaders(token);
            if (dxRiskToken) {
                headers['X-LF-DXRisk-Token'] = dxRiskToken;
                headers['X-LF-DXRisk-Source'] = '1';
                headers['X-LF-DXRisk-Captcha-Token'] = '';
            }
            var body = {
                "activity_no": ACTIVITY_NO_LOTTERY,
                "component_no": COMPONENT_NO_LOTTERY
            };
            var data = await sendRequest(baseUrl + '/llt-gateway-prod/api/v1/activity/auth/lottery/click', 'post', headers, body);

            if (data.code !== '0000') {
                if ('862101' === String(data.code)) {
                    console.log('❌ 第' + (i + 1) + '次抽奖: 风控拦截(DXRisk验证失败)');
                    console.log('💡 尝试重新获取DXRisk Token...');
                    cachedDxRiskToken = '';
                    dxRiskToken = await getConstId();
                    if (dxRiskToken) {
                        i--;
                        await sleep(getRandomWait(3000, 5000));
                        continue;
                    }
                } else if ('822001' === String(data.code)) {
                    console.log('❌ 第' + (i + 1) + '次抽奖: 登录已过期');
                    break;
                } else if ('862103' === String(data.code)) {
                    console.log('❌ 第' + (i + 1) + '次抽奖: 活动太火爆');
                    break;
                } else {
                    console.log('❌ 第' + (i + 1) + '次抽奖失败: ' + (data.msg || data.message || JSON.stringify(data)));
                }
                break;
            }

            var prizeName = data.data && data.data.prize_name ? data.data.prize_name : '未知奖品';
            var remark = data.data && data.data.remark ? data.data.remark : '';
            var prizeType = data.data && data.data.prize_type ? data.data.prize_type : '';
            console.log('🎰 第' + (i + 1) + '次抽奖: ' + prizeName + (remark ? ' (' + remark + ')' : ''));
            message += '第' + (i + 1) + '次抽奖: ' + prizeName + '\n';
            successCount++;
        } catch (e) {
            console.log('❌ 第' + (i + 1) + '次抽奖异常: ' + (e.response ? JSON.stringify(e.response.data).substring(0, 200) : e.message || e));
            break;
        }
        await sleep(getRandomWait(2000, 4000));
    }

    if (successCount > 0) {
        console.log('🎰 共抽奖 ' + successCount + ' 次');
    }
}

async function getSignStatus(token) {
    if (!ACTIVITY_NO_LOTTERY) return null;
    try {
        var headers = prepareLltHeaders(token);
        var data = await sendRequest(baseUrl + '/llt-gateway-prod/api/v1/activity/auth/enroll/sign/status', 'get', headers, {
            activity_no: ACTIVITY_NO_LOTTERY,
            component_no: COMPONENT_NO_LOTTERY
        });
        if (data.code === '0000' && data.data) {
            return data.data;
        }
    } catch (e) {
    }
    return null;
}

async function main(token) {
    console.log('========================================');
    console.log('  龙湖天街APP 签到+任务+抽奖');
    console.log('========================================');

    var disposableKey = await getDisposableKey(token);
    await sleep(getRandomWait(1000, 2000));

    var userName = await getUserInfo(token);
    if (!userName) return;
    await sleep(getRandomWait(1000, 2000));

    await sign(token, disposableKey);
    await sleep(getRandomWait(1000, 2000));

    await discoverLotteryActivity(token);
    await sleep(getRandomWait(1000, 2000));

    await doTasks(token);
    await sleep(getRandomWait(1000, 2000));

    await claimDailyChance(token);
    await sleep(getRandomWait(2000, 3000));

    await lottery(token);
}

async function sendNotify(title, msg) {
    try {
        var notify = require('./sendNotify');
        await notify.sendNotify(title, msg);
    } catch (e) {
    }
}

(async () => {
    if (!longForAppList.length) {
        console.log('❌ 未配置LONG_FOR_APP_TOKEN环境变量');
        return;
    }
    console.log('共找到 ' + longForAppList.length + ' 个账号\n');

    for (var i = 0; i < longForAppList.length; i++) {
        var token = longForAppList[i].trim();
        if (!token) continue;
        console.log('\n【账号' + (i + 1) + '】------');
        cachedDxRiskToken = '';
        try {
            await main(token);
        } catch (e) {
            console.log('❌ 账号' + (i + 1) + '执行异常: ' + (e.message || e));
            message += '账号' + (i + 1) + '异常\n';
        }
        if (i < longForAppList.length - 1) {
            await sleep(getRandomWait(3000, 5000));
        }
    }

    if (message) {
        await sendNotify('龙湖天街', message);
    }
})();
