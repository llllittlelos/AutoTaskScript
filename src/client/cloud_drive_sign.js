const { execSync } = require('child_process');
const fs = require('fs');
const PNG = require('pngjs').PNG;
const ADB = 'c:\\Users\\17804\\jsProject\\platform-tools\\adb.exe';
const LOCAL_DIR = 'c:\\Users\\17804\\jsProject\\APPsign';

if (process.stdout.isTTY) {
    process.stdout.setDefaultEncoding('utf8');
}

function adb(cmd) {
    try {
        return execSync(`${ADB} ${cmd}`, { encoding: 'utf8', timeout: 30000 }).trim();
    } catch (e) {
        return e.stdout ? e.stdout.trim() : '';
    }
}

function adbSu(cmd) {
    return adb(`shell "su -c '${cmd}'"`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function tap(x, y) {
    console.log(`  点击 (${x}, ${y})`);
    adbSu(`input tap ${x} ${y}`);
}

function goBack() {
    console.log('  返回');
    adbSu('input keyevent 4');
}

async function screenshot(name) {
    var remotePath = `/sdcard/cloud_${name}.png`;
    var localPath = `${LOCAL_DIR}\\cloud_${name}.png`;
    adbSu(`screencap -p ${remotePath}`);
    try {
        execSync(`${ADB} pull ${remotePath} "${localPath}"`, { encoding: 'utf8', timeout: 10000 });
        return localPath;
    } catch (e) {
        return null;
    }
}

async function dumpUI() {
    adbSu('uiautomator dump /sdcard/cloud_auto_ui.xml 2>/dev/null');
    await sleep(1500);
    try {
        return execSync(`${ADB} shell "su -c 'cat /sdcard/cloud_auto_ui.xml'"`, { encoding: 'utf8', timeout: 10000 });
    } catch (e) {
        return '';
    }
}

function findElement(xml, options) {
    var nodeRegex = /<node[^>]+>/g;
    var match;
    while ((match = nodeRegex.exec(xml)) !== null) {
        var node = match[0];
        var rid = node.match(/resource-id="([^"]*)"/);
        var text = node.match(/text="([^"]*)"/);
        var bounds = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
        var clickable = node.match(/clickable="([^"]*)"/);

        var ok = true;
        if (options.rid) ok = ok && rid && rid[1].includes(options.rid);
        if (options.clickable) ok = ok && clickable && clickable[1] === 'true';

        if (ok && bounds) {
            return {
                cx: Math.floor((parseInt(bounds[1]) + parseInt(bounds[3])) / 2),
                cy: Math.floor((parseInt(bounds[2]) + parseInt(bounds[4])) / 2),
            };
        }
    }
    return null;
}

function findOrangeButton(imagePath, yMin, yMax, xMin, xMax) {
    if (!fs.existsSync(imagePath)) return null;
    var data = fs.readFileSync(imagePath);
    var png = PNG.sync.read(data);
    var pixels = [];

    for (var y = yMin; y < yMax && y < png.height; y += 5) {
        for (var x = xMin; x < xMax && x < png.width; x += 5) {
            var idx = (png.width * y + x) << 2;
            var r = png.data[idx];
            var g = png.data[idx + 1];
            var b = png.data[idx + 2];
            if (r > 230 && g > 80 && g < 180 && b < 120) {
                pixels.push({ x, y });
            }
        }
    }

    if (pixels.length < 5) return null;

    var minX = Math.min(...pixels.map(p => p.x));
    var maxX = Math.max(...pixels.map(p => p.x));
    var minY = Math.min(...pixels.map(p => p.y));
    var maxY = Math.max(...pixels.map(p => p.y));

    return {
        cx: Math.floor((minX + maxX) / 2),
        cy: Math.floor((minY + maxY) / 2),
        width: maxX - minX,
        height: maxY - minY,
        pixels: pixels.length
    };
}

function hasOrangeButton(imagePath, yMin, yMax, xMin, xMax) {
    return findOrangeButton(imagePath, yMin, yMax, xMin, xMax) !== null;
}

async function launchCloudApp() {
    console.log('启动中国移动云盘...');
    adbSu('am force-stop com.chinamobile.mcloud');
    await sleep(3000);
    adbSu('monkey -p com.chinamobile.mcloud -c android.intent.category.LAUNCHER 1');

    for (var i = 0; i < 3; i++) {
        await sleep(8000);
        var xml = await dumpUI();
        var signBtn = findElement(xml, { rid: 'actionbar_sign' });
        if (signBtn) {
            console.log('云盘启动成功，找到签到按钮');
            return xml;
        }
    }

    console.log('云盘启动可能失败');
    return null;
}

async function clickSignInEntry() {
    console.log('\n=== 点击签到入口 ===');

    var xml = await dumpUI();
    var signBtn = findElement(xml, { rid: 'actionbar_sign', clickable: true });

    if (signBtn) {
        console.log(`  签到入口 at (${signBtn.cx}, ${signBtn.cy})`);
        tap(signBtn.cx, signBtn.cy);
    } else {
        console.log('  未找到签到按钮，尝试右上角默认位置');
        tap(1008, 167);
    }

    await sleep(5000);
}

async function doSignIn() {
    console.log('\n=== 执行签到 ===');

    var imgPath = await screenshot('sign_page');
    if (!imgPath) {
        console.log('  截图失败');
        return false;
    }

    var signBtn = findOrangeButton(imgPath, 1000, 1200, 800, 1080);
    if (signBtn) {
        console.log(`  找到签到按钮 at (${signBtn.cx}, ${signBtn.cy}), size=${signBtn.width}x${signBtn.height}`);
        tap(signBtn.cx, signBtn.cy);
        await sleep(3000);

        var afterPath = await screenshot('after_sign');
        if (afterPath) {
            var stillOrange = hasOrangeButton(afterPath, 1000, 1200, 800, 1080);
            if (!stillOrange) {
                console.log('  签到按钮已消失，签到成功！');
                await dismissPopup();
                return true;
            } else {
                console.log('  签到按钮仍在，可能签到失败或已签到');
            }
        }
        return true;
    }

    console.log('  未找到签到按钮（可能已签到）');
    await dismissPopup();
    return false;
}

async function dismissPopup() {
    console.log('  尝试关闭弹窗...');
    tap(540, 1200);
    await sleep(2000);

    var closePath = await screenshot('after_dismiss');
    if (closePath) {
        var stillPopup = hasOrangeButton(closePath, 1000, 1200, 800, 1080);
        if (stillPopup) {
            tap(540, 1200);
            await sleep(1000);
        }
    }
}

async function doDailyTasks() {
    console.log('\n=== 执行每日任务 ===');

    var imgPath = await screenshot('tasks_page');
    if (!imgPath) {
        console.log('  截图失败');
        return 0;
    }

    var taskBtn = findOrangeButton(imgPath, 1650, 1800, 800, 1080);
    if (taskBtn) {
        console.log(`  找到任务按钮 at (${taskBtn.cx}, ${taskBtn.cy})`);
        tap(taskBtn.cx, taskBtn.cy);
        await sleep(5000);

        var taskPath = await screenshot('task_detail');
        if (taskPath) {
            var taskBtn2 = findOrangeButton(taskPath, 1800, 2100, 100, 980);
            if (taskBtn2) {
                console.log(`  找到子任务按钮 at (${taskBtn2.cx}, ${taskBtn2.cy})`);
                tap(taskBtn2.cx, taskBtn2.cy);
                await sleep(8000);
                goBack();
                await sleep(2000);
            }
        }
        return 1;
    }

    var taskBtn2 = findOrangeButton(imgPath, 1800, 2150, 100, 980);
    if (taskBtn2) {
        console.log(`  找到底部任务按钮 at (${taskBtn2.cx}, ${taskBtn2.cy})`);
        tap(taskBtn2.cx, taskBtn2.cy);
        await sleep(8000);
        goBack();
        await sleep(2000);
        return 1;
    }

    console.log('  未找到可做的任务');
    return 0;
}

async function main() {
    console.log('========================================');
    console.log('  中国移动云盘 自动签到');
    console.log('========================================');
    console.log('时间:', new Date().toLocaleString());
    console.log('');

    var xml = await launchCloudApp();
    if (!xml) {
        console.log('启动失败，退出');
        return;
    }

    await clickSignInEntry();
    await doSignIn();
    await doDailyTasks();

    console.log('\n返回首页...');
    goBack();
    await sleep(2000);

    console.log('\n========================================');
    console.log('  执行完成');
    console.log('========================================');
    console.log('时间:', new Date().toLocaleString());
}

main().catch(e => console.error('执行异常:', e.message));
