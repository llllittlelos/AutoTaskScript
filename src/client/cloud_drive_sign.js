/**
 * 中国移动云盘签到（青龙面板版）
 *
 * 环境变量：
 * export CLOUD_DRIVE_AUTH='Basic XXXXXXXX'    多账号用 & 或换行分隔
 * export CLOUD_DRIVE_PHONE='手机号'           多账号用 & 或换行分隔，与AUTH一一对应
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
 *   方法二：抓包获取（需绕过代理检测，参考bypass_cloud_drive.js）
 *     1. 使用Frida注入bypass脚本绕过代理检测
 *     2. 用抓包工具捕获请求头中的Authorization字段
 *     3. 直接复制Basic后面的内容
 *
 * 【CLOUD_DRIVE_PHONE】手机号（必填）
 *   与AUTH一一对应，用于刷新token时指定账号
 *
 * cron: 0 8 * * *
 */
const axios = require('axios');

var authList = process.env.CLOUD_DRIVE_AUTH ? process.env.CLOUD_DRIVE_AUTH.split(/[\n&]/) : [];
// var phoneList = process.env.CLOUD_DRIVE_PHONE ? process.env.CLOUD_DRIVE_PHONE.split(/[\n&]/) : [];
var phoneList = (process.env.CLOUD_DRIVE_PHONE || "13317969292").split(/[\n&]/);
var message = '';

var UA = 'Mozilla/5.0 (Linux; Android 11; M2012K10C Build/RP1A.200720.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/90.0.4430.210 Mobile Safari/537.36 MCloudApp/10.0.1';

var JwtHeaders = {
    'User-Agent': UA,
    'Accept': '*/*',
    'Host': 'caiyun.feixin.10086.cn:7071'
};

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
        console.error('刷新token失败:', JSON.stringify(data));
        return null;
    } catch (e) {
        console.error('刷新token异常:');
        if (e.response) console.error(JSON.stringify(e.response.data));
        else console.error(e.message || e);
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
        console.error('获取jwtToken失败:', data.msg || JSON.stringify(data));
        return null;
    } catch (e) {
        console.error('获取jwtToken异常:');
        if (e.response) console.error(JSON.stringify(e.response.data));
        else console.error(e.message || e);
        return null;
    }
}

async function initAuth(authorization, account) {
    var ssoToken = await refreshToken(authorization, account);
    if (!ssoToken) {
        console.error('获取ssoToken失败，请检查Authorization是否正确');
        return false;
    }
    console.log('ssoToken获取成功');

    var jwtToken = await getJwtToken(ssoToken);
    if (!jwtToken) {
        console.error('获取jwtToken失败');
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
            url: 'https://caiyun.feixin.10086.cn/market/manager/commonMarketconfig/getByMarketRuleName?marketName=sign_in_3',
            headers: JwtHeaders
        });
        if (data.msg === 'success') {
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
        console.error('签到失败:', JSON.stringify(data));
        message += '签到失败\n';
        return false;
    } catch (e) {
        console.error('签到异常:');
        if (e.response) console.error(JSON.stringify(e.response.data));
        else console.error(e.message || e);
        message += '签到异常\n';
        return false;
    }
}

async function doPoke() {
    var successCount = 0;
    var maxPoke = 15;
    try {
        for (var i = 0; i < maxPoke; i++) {
            var data = await sendRequest({
                method: 'get',
                url: 'https://caiyun.feixin.10086.cn/market/signin/task/click?key=task&id=319',
                headers: JwtHeaders
            });
            if (data && data.result) {
                successCount++;
            }
            await sleep(500);
        }
        if (successCount > 0) {
            console.log('戳一戳成功 ' + successCount + '/' + maxPoke + ' 次');
            message += '戳一戳成功 ' + successCount + '/' + maxPoke + ' 次\n';
        } else {
            console.log('戳一戳未获得奖励');
            message += '戳一戳未获得奖励\n';
        }
    } catch (e) {
        console.error('戳一戳异常:');
        if (e.response) console.error(JSON.stringify(e.response.data));
        else console.error(e.message || e);
    }
}

async function doShake() {
    var successCount = 0;
    var maxShake = 15;
    try {
        for (var i = 0; i < maxShake; i++) {
            var data = await sendRequest({
                method: 'post',
                url: 'https://caiyun.feixin.10086.cn:7071/market/shake-server/shake/shakeIt?flag=1',
                headers: JwtHeaders
            });
            if (data && data.result) {
                var prizeConfig = data.result.shakePrizeConfig;
                if (prizeConfig) {
                    console.log('摇一摇获得: ' + prizeConfig.name);
                    successCount++;
                }
            }
            await sleep(1000);
        }
        if (successCount > 0) {
            console.log('摇一摇成功 ' + successCount + '/' + maxShake + ' 次');
            message += '摇一摇成功 ' + successCount + '/' + maxShake + ' 次\n';
        } else {
            console.log('摇一摇未中奖');
            message += '摇一摇未中奖\n';
        }
    } catch (e) {
        console.error('摇一摇异常:');
        if (e.response) console.error(JSON.stringify(e.response.data));
        else console.error(e.message || e);
    }
}

async function wxAppSign() {
    try {
        var data = await sendRequest({
            method: 'get',
            url: 'https://caiyun.feixin.10086.cn/market/playoffic/followSignInfo?isWx=true',
            headers: JwtHeaders
        });
        if (data.msg === 'success') {
            var todaySignIn = data.result && data.result.todaySignIn;
            if (todaySignIn) {
                console.log('公众号签到成功');
                message += '公众号签到成功\n';
            } else {
                console.log('公众号签到失败（可能未绑定公众号）');
                message += '公众号签到失败\n';
            }
            return;
        }
        console.log('公众号签到: ' + (data.msg || JSON.stringify(data)));
        message += '公众号签到: ' + (data.msg || '未知') + '\n';
    } catch (e) {
        console.error('公众号签到异常:');
        if (e.response) console.error(JSON.stringify(e.response.data));
        else console.error(e.message || e);
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
        console.error('获取任务列表异常:');
        if (e.response) console.error(JSON.stringify(e.response.data));
        else console.error(e.message || e);
        return {};
    }
}

async function doTask(taskId) {
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

async function doDailyTasks() {
    try {
        var taskList = await getTaskList('sign_in_3');
        for (var taskType in taskList) {
            if (taskType === 'new' || taskType === 'hidden' || taskType === 'hiddenabc') continue;
            var tasks = taskList[taskType];
            if (!Array.isArray(tasks)) continue;

            var label = taskType === 'day' ? '每日任务' : taskType === 'month' ? '每月任务' : taskType;
            console.log('\n--- 云盘' + label + ' ---');

            for (var i = 0; i < tasks.length; i++) {
                var task = tasks[i];
                var taskId = task.id;
                var taskName = task.name || '';
                var taskStatus = task.state || '';

                if (taskStatus === 'FINISH') {
                    console.log('  [' + taskName + '] 已完成');
                    continue;
                }

                if (taskId === 404 || taskId === 110 || taskId === 113 || taskId === 417 || taskId === 409) continue;

                console.log('  [' + taskName + '] 执行中...');
                var result = await doTask(taskId);
                if (result && result.msg === 'success') {
                    console.log('  [' + taskName + '] 完成');
                } else {
                    console.log('  [' + taskName + '] 未完成');
                }
                await sleep(2000);
            }
        }
    } catch (e) {
        console.error('执行每日任务异常:', e.message || e);
    }
}

async function main(authorization, account) {
    var encryptAccount = account.substring(0, 3) + '****' + account.substring(7);
    console.log('账号: ' + encryptAccount);
    message += '账号: ' + encryptAccount + '\n';

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
    await doShake();

    await sleep(getRandomWait(1e3, 2e3));
    await wxAppSign();

    await sleep(getRandomWait(1e3, 2e3));
    await doDailyTasks();
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
        if (!authorization || !account) continue;

        console.log('\n*****第[' + index + ']个移动云盘账号*****');
        message += '📣====移动云盘账号[' + index + ']====📣\n';
        await main(authorization, account);
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
