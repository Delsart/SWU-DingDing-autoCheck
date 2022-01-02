/*
 * @Author: Delsart
 * @Date: 2022-01-02 11:30:31
 * @LastEditTime: 2022-01-02 12:08:55
 * @Description: DingDing-Automatic-Clock-in (Run on AutoJs)
 * @FilePath: \SWU-DingDing-autoCheck\SWU-DingDing-autoCheck.js
 * @URL: https://github.com/Delsart/SWU-DingDing-autoCheck
 */


/* -------------------------------------------------------------------------- */
/*                                   基本参数设置                                   */
/* -------------------------------------------------------------------------- */

const ACCOUNT = ""; // 钉钉账户
const PASSWORD = ""; // 钉钉密码
const QQ = ""; // 反馈和控制消息的qq

//包名
const PACKAGE_ID_TASKER = "net.dinglisch.android.taskerm"; // Tasker
const PACKAGE_ID_QQ = "com.tencent.tim"; // qq(tim)
const PACKAGE_ID_DD = "com.alibaba.android.rimet"; // 钉钉
const PACKAGE_ID_CALENDAR = "com.oneplus.calendar"; // 日历

const LOWER_BOUND = 1 * 60 * 1000; // 最小等待时间：1min
const UPPER_BOUND = 5 * 60 * 1000; // 最大等待时间：5min

// 执行时的屏幕亮度（0-255），需要"修改系统设置"权限
const SCREEN_BRIGHTNESS = 1;

// 是否过滤通知
const NOTIFICATIONS_FILTER = true;

// 监听通知PackageId白名单
const PACKAGE_ID_WHITE_LIST = [
  PACKAGE_ID_QQ,
  PACKAGE_ID_DD,
  PACKAGE_ID_TASKER,
  PACKAGE_ID_CALENDAR,
];

// 锁屏意图，配合 Tasker 完成锁屏动作
const ACTION_LOCK_SCREEN = "autojs.intent.action.LOCK_SCREEN";

const WEEK_DAY = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/* -------------------------------------------------------------------------- */
/*                                    权限控制                                    */
/* -------------------------------------------------------------------------- */

// 检查无障碍权限
auto.waitFor("normal");

//检查系统设置权限
device.setBrightnessMode(0); // 手动亮度模式
device.setBrightnessMode(1); // 自动亮度模式

/* -------------------------------------------------------------------------- */
/*                                  主线程：监听通知                                  */
/* -------------------------------------------------------------------------- */

// 是否暂停定时打卡
var suspend = false;

// 运行日志路径
var globalLogFilePath = "/sdcard/脚本/Archive/" + getCurrentDate() + "-log.txt";

// 创建运行日志
console.setGlobalLogConfig({
  file: "/sdcard/脚本/Archive/" + getCurrentDate() + "-log.txt",
});

// 监听本机通知（入口）
events.observeNotification();
events.on("notification", function (n) {
  notificationHandler(n);
});

toastLog("监听中，请在日志中查看记录的通知及其内容");

/**
 * @description 处理通知
 */
function notificationHandler(n) {
  var packageId = n.getPackageName(); // 获取通知包名
  var abstract = n.tickerText; // 获取通知摘要
  var text = n.getText(); // 获取通知文本

  // 过滤 PackageId 白名单之外的应用所发出的通知
  if (!filterNotification(packageId, abstract, text)) return;

  // 监听摘要为 "定时打卡" 的通知，不一定要从 Tasker 中发出通知，日历、定时器等App均可实现
  if (abstract == "定时打卡" && !suspend) {
    threads.shutDownAll();
    threads.start(function () {
      holdOn(LOWER_BOUND, UPPER_BOUND); // 随机等待
      doCheck(healthCheck);
    });
    return;
  }
  if (abstract == "定时查寝" && !suspend) {
    threads.shutDownAll();
    threads.start(function () {
      holdOn(LOWER_BOUND, UPPER_BOUND); // 随机等待
      doCheck(dormCheck);
    });
    return;
  }

  // 监听文本（和上面的区别是逻辑上用于指令，非定时，无伪装等待时间
  switch (text) {
    case "健康打卡": // 监听文本为 "健康打卡" 的通知
      threads.shutDownAll();
      threads.start(function () {
        doCheck(healthCheck);
      });
      break;

    case "查寝": // 监听文本为 "查寝" 的通知
      threads.shutDownAll();
      threads.start(function () {
        doCheck(dormCheck);
      });
      break;

    case "查询": // 监听文本为 "查询" 的通知
      threads.shutDownAll();
      threads.start(function () {
        brightScreen();
        sendQQMsg(
          "电量: " +
            device.getBattery() +
            "\n" +
            "暂停: " +
            suspend +
            "\n" +
            getStorageData("dingding", "dormCheck") +
            " \n" +
            getStorageData("dingding", "healthCheck")
        );
        lockScreen();
      });
      break;

    case "暂停": // 监听文本为 "暂停" 的通知
      threads.shutDownAll();
      threads.start(function () {
        brightScreen();
        suspend = true;
        sendQQMsg("暂停: " + suspend);
        lockScreen();
      });
      break;

    case "恢复": // 监听文本为 "恢复" 的通知
      threads.shutDownAll();
      threads.start(function () {
        brightScreen();
        suspend = false;
        sendQQMsg("暂停: " + suspend);
        lockScreen();
      });
      break;

    case "test": // 监听文本为 "test" 的通知
      threads.shutDownAll();
      threads.start(function () {
        brightScreen();
        signIn();
      });
      break;

    case "日志": // 监听文本为 "日志" 的通知
      threads.shutDownAll();
      threads.start(function () {
        brightScreen();
        sendQQMsg(getLogFile(3200));
        lockScreen();
      });
      break;

    default:
      break;
  }
}

/* -------------------------------------------------------------------------- */
/*                                    打卡处理                                    */
/* -------------------------------------------------------------------------- */

/**
 * @description 打卡流程
 */
function doCheck(check) {
  brightScreen(); // 唤醒屏幕
  setVolume(0); // 设备静音
  signIn(); // 打开钉钉自动登录
  sleep(500); //等待登录（学校认证和钉钉登录有延迟）
  check(); //打卡操作
  stopApplication(PACKAGE_ID_DD); //停止钉钉
  lockScreen(); // 关闭屏幕
}

/**
 * @description 发送QQ消息
 * @param {string} message 消息内容
 */
function sendQQMsg(message) {
  if (QQ.length < 2) return; // 未填写qq号
  console.log("发送QQ消息");

  app.startActivity({
    action: "android.intent.action.VIEW",
    data: "mqq://im/chat?chat_type=wpa&version=1&src_type=web&uin=" + QQ,
    packageName: PACKAGE_ID_QQ,
  });

  id("input").waitFor();
  id("input").findOne().setText(message);
  id("fun_btn").findOne().click();
  secureHome(200);
}

/**
 * @description 唤醒设备
 */
function brightScreen() {
  console.log("唤醒设备");

  device.setBrightnessMode(0); // 手动亮度模式
  device.setBrightness(SCREEN_BRIGHTNESS);
  device.wakeUpIfNeeded(); // 唤醒设备
  device.keepScreenOn(); // 保持亮屏

  if (!device.isScreenOn()) {
    console.warn("设备未唤醒，重试");
    device.wakeUpIfNeeded();
    brightScreen();
  } else {
    console.info("设备已唤醒");
  }
}

/**
 * @description 锁屏
 */
function lockScreen() {
  console.log("关闭屏幕");

  // 锁屏方案1：Root
  // Power()

  // 锁屏方案2：No Root
  // press(Math.floor(device.width / 2), Math.floor(device.height * 0.973), 1000) // 小米的快捷手势：长按Home键锁屏

  // 万能锁屏方案：向Tasker发送广播，触发系统锁屏动作。配置方法见 2021-03-09 更新日志
  app.sendBroadcast({ action: ACTION_LOCK_SCREEN });
  device.setBrightnessMode(1); // 自动亮度模式
  device.cancelKeepingAwake(); // 取消设备常亮

  sleep(200);
  if (!device.isScreenOn()) {
    console.info("屏幕已关闭");
  } else {
    console.error("屏幕未关闭，请尝试其他锁屏方案，或等待屏幕自动关闭");
  }
}

/**
 * @description 随机等待
 */
function holdOn(low, up) {
  let randomTime = random(low, up);
  console.log("等待: " + randomTime + "ms");
  sleep(randomTime);
}

/**
 * @description 启动并登陆钉钉
 */
function signIn() {
  app.launchPackage(PACKAGE_ID_DD); //启动钉钉
  console.log("正在启动: " + app.getAppName(PACKAGE_ID_DD));

  while (
    !(
      currentActivity() ==
        "com.alibaba.android.user.login.SignUpWithPwdActivity" ||
      null != id("home_im_tab_popup").findOnce()
    )
  )
    sleep(200); // 等待钉钉启动

  if (
    currentPackage() == PACKAGE_ID_DD &&
    currentActivity() == "com.alibaba.android.user.login.SignUpWithPwdActivity"
  ) {
    console.info("账号未登录");

    id("et_phone_input").findOne().setText(ACCOUNT);
    console.log("输入账号");

    id("et_pwd_login").findOne().setText(PASSWORD);
    console.log("输入密码");

    id("cb_privacy").findOne().click();
    console.log("同意隐私协议");

    id("btn_next").findOne().click();
    console.log("正在登陆...");
  } else {
    console.info("账号已登录");
  }

  while (null == id("home_im_tab_popup").findOnce()) sleep(200); // 等待进入主页面
  console.log("启动完毕");
}

/**
 * @description 健康打卡
 */
function healthCheck() {
  console.log("健康打卡...");
  if (
    waitAndClick("工作台") &&
    waitAndClick("健康打卡") &&
    waitAndClick("立即上报") &&
    waitAndClick("提交") &&
    waitAndCheck("提交成功")
  ) {
    console.log("打卡成功");
    setStorageData(
      "dingding",
      "healthCheck",
      getCurrentDate() + " 健康打卡成功"
    );
    sendQQMsg(getCurrentDate() + " 健康打卡成功");
  } else {
    console.log("打卡失败");
    setStorageData(
      "dingding",
      "healthCheck",
      getCurrentDate() + " 健康打卡失败"
    );
    sendQQMsg(getCurrentDate() + " 健康打卡失败");
  }
}

/**
 * @description 查寝
 */
function dormCheck() {
  console.log("查寝打卡...");
  if (
    waitAndClick("工作台") &&
    waitAndClick("学生查寝") &&
    waitAndClick("每日查寝设置") &&
    waitAndClick("提交") &&
    waitAndCheck("提交成功")
  ) {
    console.log("打卡成功");
    setStorageData("dingding", "dormCheck", getCurrentDate() + " 查寝成功");
    sendQQMsg(getCurrentDate() + " 查寝成功");
  } else {
    console.log("打卡失败");
    setStorageData("dingding", "dormCheck", getCurrentDate() + " 查寝失败");
    sendQQMsg(getCurrentDate() + " 查寝失败");
  }
}

/**
 * @description 循环等待点击
 */
function waitAndClick(clickText) {
  console.log("start click: " + clickText);
  for (let index = 0; index < 10; index++) {
    if (
      null != text(clickText).findOnce() &&
      null == text("加载中").findOnce()
    ) {
      while (!click(clickText));
      console.log("success click: " + clickText);
      return true;
    }
    holdOn(500 + index * 50, 500 + index * 100); // 随机退让
  }
  console.error("time out: " + clickText);
  return false;
}

/**
 * @description 循环等待检查
 */
function waitAndCheck(checkText) {
  console.log("start check: " + checkText);
  for (let index = 0; index < 10; index++) {
    if (null != text(checkText).findOnce()) {
      console.log("success check: " + checkText);
      return true;
    }
    holdOn(500 + index * 50, 500 + index * 100); // 随机退让
  }
  console.error("time out: " + checkText);
  return false;
}

/**
 * @description 安全的返回键模拟
 */
function secureHome() {
  home();
  sleep(200); //等待系统动画结束
}

/**
 * @description 强行停止应用
 */
function stopApplication(packageName) {
  console.log("强行停止：" + packageName);
  openAppSetting(packageName);
  waitAndClick("强行停止");
  waitAndClick("确定");
  secureHome();
}

/* -------------------------------------------------------------------------- */
/*                                    功能函数                                    */
/* -------------------------------------------------------------------------- */

function dateDigitToString(num) {
  return num < 10 ? "0" + num : num;
}

function getCurrentTime() {
  let currentDate = new Date();
  let hours = dateDigitToString(currentDate.getHours());
  let minute = dateDigitToString(currentDate.getMinutes());
  let second = dateDigitToString(currentDate.getSeconds());
  let formattedTimeString = hours + ":" + minute + ":" + second;
  return formattedTimeString;
}

function getCurrentDate() {
  let currentDate = new Date();
  let year = dateDigitToString(currentDate.getFullYear());
  let month = dateDigitToString(currentDate.getMonth() + 1);
  let date = dateDigitToString(currentDate.getDate());
  let week = currentDate.getDay();
  let formattedDateString =
    year + "-" + month + "-" + date + "-" + WEEK_DAY[week];
  return formattedDateString;
}

var lastNotification = new Date().getTime();
// 通知过滤器
function filterNotification(bundleId, abstract, text) {
  if (new Date().getTime() - lastNotification < 50) return; // 防止频繁触发
  let check = PACKAGE_ID_WHITE_LIST.some(function (item) {
    return bundleId == item;
  });
  if (!NOTIFICATIONS_FILTER || check) {
    console.verbose("-------------收到通知--------------");
    console.verbose("bundleId: " + bundleId);
    console.verbose("abstract: " + abstract);
    console.verbose("text: " + text);
    console.verbose("----------------------------------");
    lastNotification = new Date().getTime();
    return true;
  } else {
    return false;
  }
}

// 保存本地数据
function setStorageData(name, key, value) {
  const storage = storages.create(name); // 创建storage对象
  storage.put(key, value);
}

// 读取本地数据
function getStorageData(name, key) {
  const storage = storages.create(name);
  if (storage.contains(key)) {
    return storage.get(key, "");
  }
  // 默认返回undefined
}

// 删除本地数据
function delStorageData(name, key) {
  const storage = storages.create(name);
  if (storage.contains(key)) {
    storage.remove(key);
  }
}

// 获取应用版本号
function getPackageVersion(bundleId) {
  importPackage(android.content);
  var pckMan = context.getPackageManager();
  var packageInfo = pckMan.getPackageInfo(bundleId, 0);
  return packageInfo.versionName;
}

// 设置媒体和通知音量
function setVolume(volume) {
  console.log("调整通知音量: " + volume);
  device.setMusicVolume(volume);
  device.setNotificationVolume(volume);
  //   console.verbose("媒体音量:" + device.getMusicVolume());
  //   console.verbose("通知音量:" + device.getNotificationVolume());
}

//获取当天日志
function getLogFile(limit) {
  const fileName = "/sdcard/脚本/Archive/" + getCurrentDate() + "-log.txt";
  let text = files.read(fileName);
  return text.substring(Math.max(0, text.length - limit));
}
