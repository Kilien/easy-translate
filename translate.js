const fs = require('fs');
const path = require('path');
const axios = require('axios');
const readline = require('readline/promises');
const { promisify } = require('util');
const { URL, URLSearchParams } = require('url');
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const { stdin: input, stdout: output } = require('process');
const ac = new AbortController();
const signal = ac.signal;

const defaultConfig = {
  baseURL: '',
  timeout: 15000
};

Object.assign(axios.defaults, defaultConfig);
axios.defaults.headers['Content-Type'] = 'application/json';
// 请求拦截器
axios.interceptors.request.use(
  config => {
    const proxy = {
      host: '127.0.0.1', //代理服务器地址
      port: 7890 //端口
    }

    if (config.method === 'get') {
      config.proxy = proxy
    }
    return config;
  },
  err => {
    // 对请求错误做些什么
    return Promise.reject(err);
  }
);

axios.interceptors.response.use(
  response => {
    return response;
  },
  function axiosRetryInterceptor(err) {
    var config = err.config;
    // If config does not exist or the retry option is not set, reject
    if (!config || !config.retry) return Promise.reject(err);

    // Set the variable for keeping track of the retry count
    config.__retryCount = config.__retryCount || 0;

    // Check if we've maxed out the total number of retries
    if (config.__retryCount >= config.retry) {
      // Reject with the error
      return Promise.reject(err);
    }
    // Increase the retry count
    config.__retryCount += 1;
    console.log('报错了，重发、、、', config.__retryCount);

    // Create new promise to handle exponential backoff
    var backoff = new Promise(function (resolve) {
      setTimeout(function () {
        resolve();
      }, config.retryDelay || 1);
    });

    // Return the promise in which recalls axios to retry the request
    return backoff.then(function () {
      return axios(config);
    });
  }
);
/**
 * 文本转换对应
 * cn 中文 en 英文 jp 日语 ko 韩语
 */
const langMap = {
  cn: 'ZH',
  en: 'EN',
  jp: 'JA',
  ko: 'KO',
  test: 'JA',
};

const language = 'test';
const transLang = 'cn';
const googleUrl = 'https://translate.googleapis.com/translate_a/single';
const deepLUrl = 'https://api-free.deepl.com/v2/translate';
let i18nFilePath = `./src/locales/${language}.json`;
let transFilePath = `./src/locales/${transLang}.json`;

/**
 * 使用Google翻译日语
 * @param {*} transContents 待翻译内容
 * @param {*} transKeys 待翻译Key
 * @returns 
 */
async function translationJsonFile(transContents, transKeys) {
  const originMap = {};
  // 检查文件是否存在于当前目录中、以及是否可写。
  let bakContent = {};

  for (let index = 0; index < transKeys.length; index++) {
    const key = transKeys[index];
    const cnt = transContents[index];
    // const pattern_en = new RegExp('[A-Za-z ]+|(?![\u0800-\u4e00]+)');
    const pattern_num = new RegExp('^[0-9]+$');
    const pattern_en = new RegExp('(?=.*[A-Za-z ])(?!.*[\u0800-\u4e00])');
    const pattern_jp = new RegExp('[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]+')

    if (pattern_jp.test(cnt)) {
      bakContent[key] = cnt;
    } else {
      originMap[key] = cnt;
    }
  }
  // console.log('origin...', originMap);
  const translationsMap = await googleTranslate(bakContent);
  const data = { ...originMap, ...translationsMap };

  console.log('content...', data);
  return data;
}

/**
 * 调用deepL接口翻译
 * @param {*} content
 * @returns
 */
async function deepLTranslate(content) {
  // 空数组
  if (!Object.keys(content).length) {
    return {};
  }
  const body = {
    text: 'hey',
    target_lang: 'ZH'
  };

  const response = await fetch(deepLUrl, {
    method: 'POST',
    headers: {
      'Content-type': 'application/x-www-form-urlencoded',
      Authorization: `DeepL-Auth-Key ${process.env.KEY}`
    },
    body: `text=${content}&source_lang=${langMap[language]}&target_lang=${langMap[transLang]}`
  });

  const res = await response.json();
  // const text = JSON.parse(res.translations[0].text);
  console.log(' Translate res...', res);
  const text = res.translations[0].text;
  console.log('Translate...', text);
  return text;
}

/**
 * 调用deepL接口翻译
 * @param {*} content
 * @returns
 */
async function googleTranslate(content) {
  // 空数组
  if (!Object.keys(content).length) {
    return {};
  }

  const urlList = [];
  const keyList = [];
  const ctnList = [];
  for (let [k, c] of Object.entries(content)) {
    keyList.push(k);
    const ctn = c.replace(/[\n\r]/g, '');
    ctnList.push(ctn);
    urlList.push(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=zh-CN&hl=zh-CN&dt=t&dt=bd&ie=UTF-8&oe=UTF-8&dj=1&q=${encodeURI(
        ctn
      )}`
    );
  }

  const data = {};
  // const axiosWithLogs = getAxiosWithLogs();
  const requests = urlList.map(url => {
    const res = axios.get(url, { retry: 3, retryDelay: 1000 });
    return res;
  });

  try {
    await Promise.all(requests).then(responses => {
      responses.forEach((res, inx) => {
        try {
          // console.log('data...', res?.data?.sentences.length, res?.data?.sentences);
          if (res?.data?.sentences.length) {
            const trans = res?.data?.sentences[0]?.trans;
            const content = trans.replace(/(^\s|“)+|(\s|”)+$/g, '');
            data[keyList[inx]] = content;
          } else {
            console.log('有问题。。。', res?.data);
          }
        } catch (error) {
          data[keyList[inx]] = ctnList[inx];
        }
      });
      return data;
    });
  } catch (err) {
    console.log(`error: `, err?.data);
    return {};
  }

  // console.log('Translate...', data);
  return data;
}

/**
 * 创建 en.json 目录
 * @param {*} path_way
 * @returns
 */
function doReadExitFile(path_way) {
  return new Promise((resolve, reject) => {
    fs.access(path_way, async err => {
      if (err) {
        await writeFileAsync(path_way, '{}', 'utf-8', e => {
          reject(false);
        });
      } else {
        const bakContent_file = fs.readFileSync(path_way, 'utf8');
        const bakContent = JSON.parse(bakContent_file);
        resolve(bakContent);
      }
    });
  });
}

// 将翻译内容写入 JSON 文件
async function writeTranslationsToFile(translations, filePath) {
  const curFile = fs.readFileSync(filePath, 'utf8');
  const fileContent = JSON.parse(curFile);
  const data = { ...fileContent, ...translations };
  const jsonData = JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, jsonData);
}

async function appendContentToFile(contents, filePath, flag) {
  const jsonData = JSON.stringify(contents, null, 2);
  const costData = jsonData.replace(/(^\s|{)+|(\s|})+$/g, '');
  let data = '';
  if (flag === 1) {
    data = '{' + costData + ',';
  } else if (flag === 2) {
    data = costData + '\n}';
  } else if (flag === 3) {
    data = '{' + costData + '\n}';
  } else {
    data = costData + ',';
  }
  fs.appendFileSync(filePath, data, 'utf-8');
}

/**
 * 询问生成文件
 */
async function readInpJsonDir() {
  const rl = readline.createInterface({ input, output });
  const timeoutInSeconds = 10;
  setTimeout(() => ac.abort(), timeoutInSeconds * 1000);
  try {
    const lang = await rl.question(
      'What is the language you want to translate? (Default English)',
      { signal }
    );

    if (lang) {
      i18nFilePath = `./src/locales/${lang}.json`;
      console.log(`The generated directory will be ${`./src/locales/${lang}.json`}`);
    }

    const transLang = await rl.question(
      'What is the language you want to translate? (Default Chinese)',
      { signal }
    );
    if (transLang) {
      transFilePath = `./src/locales/${transLang}.json`;
      console.log(`The generated directory will be ${`./src/locales/${transLang}.json`}`);
    }
  } catch (err) {
    let message = 'Error: ';
    if (err.code === 'ABORT_ERR') {
      message = `You took too long. Try again within ${timeoutInSeconds} seconds.`;
    }
  } finally {
    rl.close();
  }

  // listen for close event
  rl.on('close', () => {
    console.log('Start to replace...');

    // exit the process
    process.exit(1);
  });
}

async function testOne() {
  let proxy = {
    host: '127.0.0.1', //代理服务器地址
    port: 7890 //端口
  };
  const content =
    'こうやってボク君と4人で食事をするのが\n　すっかり当たり前になったなって\n　ふと気づいたの」';
  const ctn = content.replace(/[\n\r]/g, '');
  console.log('testOne...', ctn);
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=zh-CN&hl=zh-CN&dt=t&dt=bd&ie=UTF-8&oe=UTF-8&dj=1&q=${encodeURI(
    ctn
  )}`;

  const res = await axios.get(url, { retry: 3, retryDelay: 1000,  });
  console.log('当前数据。。。', res?.data);
}

// 测试代码
async function main() {
  // await readInpJsonDir();

  const content = await doReadExitFile(i18nFilePath);
  const totalKeys = Object.keys(content);
  const counts = Object.keys(content).length;
  console.log('当前长度、、、', counts);

  const subKeys = [];
  const subContents = [];
  const offset = 32;

  let tempArr = [];
  let tempCnt = [];
  for (let index = 0; index < counts; index++) {
    const key = totalKeys[index];
    if (index !== 0 && index % offset == 0) {
      subKeys.push(tempArr);
      subContents.push(tempCnt);
      tempArr = [];
      tempCnt = [];
      tempArr.push(key);
      tempCnt.push(content[key]);
    } else if (index == counts - 1) {
      tempArr.push(key);
      tempCnt.push(content[key]);
      subKeys.push(tempArr);
      subContents.push(tempCnt);
      tempArr = [];
      tempCnt = [];
    } else {
      tempArr.push(key);
      tempCnt.push(content[key]);
    }
  }
  // console.log('map...', subKeys, subContents);

  for (let i = 0, len = subKeys.length; i < len; i++) {
    const keyList = subKeys[i];
    const contentList = subContents[i];
    const translations = await translationJsonFile(contentList, keyList);
    let flag = 0;
    if (subKeys.length == 1) {
      flag = 3; // 只有一项的情况
    } else if (i == 0) {
      flag = 1; // 开头
    } else if (i == subKeys.length - 1) {
      flag = 2; // 结尾
    } else {
      flag = 0;
    }
    await appendContentToFile(translations, transFilePath, flag);
  }

  // await testOne();
  console.log('Done');
}

main();
