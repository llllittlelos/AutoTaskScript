/**
 * #小程序://龙湖天街/pi5MO0UC9oQJ49D
 *
 * 抓包 Host：https://gw2c-hw-open.longfor.com 获取请求头 token 的值
 * export LONG_FOR_TOKEN = '8b465xxxxxxxxxxxxxxxxx'
 * 多账号用 & 或换行
 *
 * 作者号黑了，而且基本也没跑过，所以懒得修复了，解密版本放出来，有能力的自行改一改，就几个接口，抓抓包改改就好了
 *
 * @author Telegram@sudojia
 * @site https://blog.imzjw.cn
 * @date 2024/09/18
 *
 * const $ = new Env('龙湖天街')
 * cron: 39 8 * * *
 */
const axios = require('axios');
const initScript = require('../utils/initScript')
const {$, notify, sudojia, checkUpdate} = initScript('龙湖天街');
// const longForList = process.env.LONG_FOR_TOKEN ? process.env.LONG_FOR_TOKEN.split(/[\n&]/) : [];
// 消息推送
// let message = '';

var longForList = process.env.LONG_FOR_TOKEN ? process.env.LONG_FOR_TOKEN.split(/[\n&]/) : [];
var message = '';

// 接口地址
const baseUrl = 'https://gw2c-hw-open.longfor.com'
// 请求头
// const headers = {
//     'User-Agent': sudojia.getRandomUserAgent(),
//     'Content-Type': 'application/json',
//     'Accept-Language': 'zh-CN,zh;q=0.9',
// };
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... MicroMessenger/7.0.20...',
    'Content-Type': 'application/json',
    'X-LF-App-Version': '1.25.0',
    'X-LF-Api-Version': 'v1_25_0',
    'X-LF-Bucode': 'C20400',
    'X-LF-Channel': 'C2',
    'X-Client-Type': 'microApp',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'X-GAIA-API-KEY': '98717e7a-a039-46af-8143-be7558a089c0'
};
const baseHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF WindowsWechat(0x63090a13) UnifiedPCWindowsWechat(0xf254173b) XWEB/19027',
    'Content-Type': 'application/json',
    'xweb_xhr': '1', // 必须加上
    'X-LF-App-Version': '1.25.0',
    'X-LF-Api-Version': 'v1_25_0',
    'X-LF-Bucode': 'C20400',
    'X-LF-Channel': 'C2',
    'X-Client-Type': 'microApp',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'X-GAIA-API-KEY': '98717e7a-a039-46af-8143-be7558a089c0'
};
// 签到抽奖的key
const API_KEY = 'c06753f1-3e68-437d-b592-b94656ea5517';
const BU_CODE = 'C20400';
const DX_RISK_SOURCE = 5;
const CHANNEL = 'C2';
// 签到活动ID
const ACTIVITY_NO_SIGN = '11111111111686241863606037740000';
// 抽奖活动ID
const ACTIVITY_NO_LOTTERY = '11111111111725156856102879310000';



const crypto = require('crypto');

const SECRET_KEYS = {
  app: '20jtGtg5TQ9V1A3Q4RsxBzJqb@^WUS%m',
  microApp: 'Q74eKtH5LePYfSjIiflUbCL2gxjTa7rF'
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
    var key = SECRET_KEYS.microApp;
    var i = "";
    if (n) {
        i = n + "&";
    }
    i += timestamp + "&" + key;
    return {
        "X-LONGZHU-TimeStamp": timestamp,
        "X-Client-Type": "microApp",
        "X-LONGZHU-Sign": crypto.createHash('md5').update(i).digest('hex')
    };
}



function parseData(data) {
  var result = {};
  try {
    if (data) {
      if (typeof data === 'string') {
        result = JSON.parse(data);
      } else if (typeof data === 'object') {
        result = JSON.parse(JSON.stringify(data));
      }
    }
  } catch (e) {
    result = {};
  }
  return result;
}

function getUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0;
        var v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    }).toUpperCase();
}



// // 测试：空请求体
// console.log(generateSign({}));
// // 测试：带参数的请求体
// console.log(generateSign({ skuId: '123', count: 1 }));


// !(async () => {
//     await checkUpdate($.name, longForList);
//     console.log(`\n已随机分配 User-Agent\n\n${headers['user-agent'] || headers['User-Agent']}`);
//     for (let i = 0; i < longForList.length; i++) {
//         const index = i + 1;
//         headers.token = longForList[i];
//         headers.lmToken = longForList[i];
//         console.log(`\n*****第[${index}]个${$.name}账号*****`);
//         message += `📣====${$.name}账号[${index}]====📣\n`;
//         await main();
//         await $.wait(sudojia.getRandomWait(2e3, 3e3));
//     }
//     if (message) {
//         await notify.sendNotify(`「${$.name}」`, `${message}`);
//     }
// })().catch((e) => $.logErr(e)).finally(() => $.done());

// async function main() {
//     await getUserInfo();
//     await $.wait(sudojia.getRandomWait(1e3, 2e3));
//     await sign()
//     await $.wait(sudojia.getRandomWait(1e3, 2e3));
//     await lotterySign();
//     await $.wait(sudojia.getRandomWait(1e3, 2e3));
//     await lottery();
// }


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



!(async () => {
    if (longForList.length === 0) {
        console.log('请设置环境变量 LONG_FOR_TOKEN，多个token用换行或&分隔');
        console.log('用法: LONG_FOR_TOKEN=你的token node longfor-login.js');
        process.exit(1);
    }

    for (var i = 0; i < longForList.length; i++) {
        var index = i + 1;
        var token = longForList[i].trim();
        if (!token) continue;
        console.log('\n*****第[' + index + ']个龙湖天街账号*****');
        message += '📣====龙湖天街账号[' + index + ']====📣\n';
        await main(token);
        await sleep(getRandomWait(2e3, 3e3));
    }

    if (message) {
        console.log('\n========== 执行结果 ==========');
        console.log(message);
    }
})().catch(function (e) {
    console.error('脚本执行异常:', e.message || e);
}).finally(function () {
    process.exit(0);
});

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
            return console.error('抽奖失败', JSON.stringify(data));
        }
        console.log('抽奖成功，获得' + data.data.desc);
        message += '抽奖成功，获得' + data.data.desc + '\n\n';
    } catch (e) {
        console.error('抽奖时发生异常:');
        if (e.response) console.error(JSON.stringify(e.response.data));
        else console.error(e.message || e);
    }
}

/**
 * 获取用户信息
 *
 * @return {Promise<void>}
 */
// async function getUserInfo() {
//     try {
//         const headerCp = JSON.parse(JSON.stringify(headers));
//         headerCp['X-Gaia-Api-Key'] = API_KEY;
//         const data = await sudojia.sendRequest(`${baseUrl}/riyuehu-miniapp-prod/service/ryh/user/info`, 'post', headerCp, {
//             "data": {
//                 "projectId": "B379F9F1-C176-4925-B6F6-92555AC62E61"
//             }
//         });
//         console.log(`${data.data.nickName}(${data.data.mobile})`);
//         message += `${data.data.nickName}(${data.data.mobile})\n`;
//     } catch (e) {
//         console.error(`获取用户信息时发生异常:`, e.response.data);
//         if (e.response) console.log("服务器返回：", JSON.stringify(e.response.data));
//     }
// }

/**
 * 每日签到
 *
 * @returns {Promise<void>}
 */
// async function sign() {
//     try {
//         const data = await sudojia.sendRequest(`${baseUrl}/lmarketing-task-api-mvc-prod/openapi/task/v1/signature/clock`, 'post', prepareHeaders(), {
//             "activity_no": ACTIVITY_NO_SIGN
//         });
//         if ('0000' !== data.code) {
//             return console.error(`签到失败 ->`, data);
//         }
//         data.data.is_popup === 1 ? console.log(`签到成功！成长值+${data.data.reward_info[0].reward_num}`) : console.log(`今日已签到`);
//         data.data.is_popup === 1 ? message += `签到成功！成长值+${data.data.reward_info[0].reward_num}\n` : message += `今日已签到\n`;
//     } catch (e) {
//         console.error(`签到时发生异常:`, e.response.data);
//     }
// }

/**
 * 签到抽奖
 *
 * @returns {Promise<void>}
 */
// async function lotterySign() {
//     try {
//         const data = await sudojia.sendRequest(`${baseUrl}/lmarketing-task-api-mvc-prod/openapi/task/v1/lottery/sign`, 'post', prepareHeaders(), {
//             "activity_no": ACTIVITY_NO_LOTTERY,
//             "task_id": ""
//         });
//         if ('0000' !== data.code) {
//             return console.error(`抽奖签到失败 ->`, data);
//         }
//         console.log(`抽奖签到成功，获得${data.data.ticket_times}次抽奖机会`);
//         message += `抽奖签到成功\n`
//     } catch (e) {
//         console.error(`抽奖签到时发生异常:`, e.response.data);
//     }
// }

/**
 * 抽奖
 *
 * @returns {Promise<void>}
 */
// async function lottery() {
//     try {
//         const data = await sudojia.sendRequest(`${baseUrl}/lmarketing-task-api-mvc-prod/openapi/task/v1/lottery/luck`, 'post', prepareHeaders(), {
//             "activity_no": ACTIVITY_NO_LOTTERY,
//             "task_id": ""
//         });
//         if ('0000' !== data.code) {
//             return console.error(`抽奖失败`, data);
//         }
//         console.log(`抽奖成功，获得${data.data.desc}`);
//         message += `抽奖成功，获得${data.data.desc}\n\n`;
//     } catch (e) {
//         console.error(`抽奖时发生异常:`, e.response.data);
//     }
// }

// function prepareHeaders() {
//     const headerCp = JSON.parse(JSON.stringify(headers));
//     headerCp['X-Gaia-Api-Key'] = API_KEY;
//     headerCp['X-LF-UserToken'] = headers.lmtoken;
//     headerCp['X-LF-Bu-Code'] = BU_CODE;
//     headerCp['X-LF-DXRisk-Source'] = DX_RISK_SOURCE;
//     headerCp['X-LF-DXRisk-Captcha-Token'] = DX_RISK_CAPTCHA_TOKEN;
//     headerCp['X-LF-Channel'] = CHANNEL;
//     headerCp['X-LONGZHU-Sign'] = 'e526dfa232f653c6dcafe938da81e6ba';
//     headerCp['X-LONGZHU-TimeStamp'] = '1777732943792';
//     headerCp['X-LF-RequestId'] = '5013EA52-DAC0-44CD-84D0-EF066448A12E';    
//     return headerCp;
// }
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
    var dxRiskToken = process.env.LONG_FOR_DX_RISK_TOKEN || '';
    if (dxRiskToken) {
        headerCp['X-LF-DXRisk-Token'] = dxRiskToken;
    }
    headerCp['X-LF-Channel'] = CHANNEL;
    headerCp['Accept'] = 'application/json, text/plain, */*';
    headerCp['Origin'] = 'https://longzhu.longfor.com';
    headerCp['Referer'] = 'https://longzhu.longfor.com/';
    headerCp['X-LF-RequestId'] = getUUID();
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


// !(async () => {
//     if (longForList.length === 0) {
//         console.log('请设置环境变量 LONG_FOR_TOKEN，多个token用换行或&分隔');
//         console.log('用法: LONG_FOR_TOKEN=你的token node longfor-login.js');
//         process.exit(1);
//     }

//     for (var i = 0; i < longForList.length; i++) {
//         var index = i + 1;
//         var token = longForList[i].trim();
//         if (!token) continue;
//         console.log('\n*****第[' + index + ']个龙湖天街账号*****');
//         message += '📣====龙湖天街账号[' + index + ']====📣\n';
//         await main(token);
//         await sleep(getRandomWait(2e3, 3e3));
//     }

//     if (message) {
//         console.log('\n========== 执行结果 ==========');
//         console.log(message);
//     }
// })().catch(function (e) {
//     console.error('脚本执行异常:', e.message || e);
// }).finally(function () {
//     process.exit(0);
// });

