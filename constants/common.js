/* eslint-disable consistent-return */
/* eslint-disable no-console */
/* eslint-disable camelcase */
/* eslint-disable no-use-before-define */
import validator from 'validator';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import * as cheerio from 'cheerio';
import crawlee, { Request } from 'crawlee';
import { parseString } from 'xml2js';
import fs from 'fs';
import path from 'path';
import safe from 'safe-regex';
import * as https from 'https';
import os from 'os';
import { globSync } from 'glob';
import { devices, webkit } from 'playwright';
import printMessage from 'print-message';
import constants, {
  getDefaultChromeDataDir,
  getDefaultEdgeDataDir,
  proxy,
  formDataFields,
} from './constants.js';
import { silentLogger } from '../logs.js';
import { isUrlPdf } from '../crawlers/commonCrawlerFunc.js';

// validateDirPath validates a provided directory path
// returns null if no error
export const validateDirPath = dirPath => {
  if (typeof dirPath !== 'string') {
    return 'Please provide string value of directory path.';
  }

  try {
    fs.accessSync(dirPath);
    if (!fs.statSync(dirPath).isDirectory()) {
      return 'Please provide a directory path.';
    }

    return null;
  } catch (error) {
    return 'Please ensure path provided exists.';
  }
};

export const validateCustomFlowLabel = (customFlowLabel) => {
  const containsReserveWithDot = constants.reserveFileNameKeywords.some(char => customFlowLabel.toLowerCase().includes(char.toLowerCase() + "."));
  const containsForbiddenCharacters = constants.forbiddenCharactersInDirPath.some((char) => customFlowLabel.includes(char));
  const exceedsMaxLength = customFlowLabel.length > 80; 
  
  if (containsForbiddenCharacters) {
    const displayForbiddenCharacters = constants.forbiddenCharactersInDirPath.toString().replaceAll(',', ' , '); 
    return { isValid: false, errorMessage: `Invalid label. Cannot contain ${displayForbiddenCharacters}`}
  }
  if (exceedsMaxLength) {
    return { isValid: false, errorMessage: `Invalid label. Cannot exceed 80 characters.`}
  }
  if (containsReserveWithDot) {
    const displayReserveKeywords = constants.reserveFileNameKeywords.toString().replaceAll(',', ' , ');
    return { isValid: false, errorMessage: `Invalid label. Cannot have '.' appended to ${displayReserveKeywords} as they are reserved keywords.`};
  }
  return { isValid: true }
}

// validateFilePath validates a provided file path
// returns null if no error
export const validateFilePath = (filePath, cliDir) => {
  if (typeof filePath !== 'string') {
    throw new Error('Please provide string value of file path.');
  }

  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(cliDir, filePath);
  try {
    fs.accessSync(absolutePath);
    if (!fs.statSync(absolutePath).isFile()) {
      throw new Error('Please provide a file path.');
    }

    if (path.extname(absolutePath) !== '.txt') {
      throw new Error('Please provide a file with txt extension.');
    }

    return absolutePath;
  } catch (error) {
    throw new Error('Please ensure path provided exists.');
  }
};

export const getBlackListedPatterns = blacklistedPatternsFilename => {
  let exclusionsFile = null;
  if (blacklistedPatternsFilename) {
    exclusionsFile = blacklistedPatternsFilename;
  } else if (fs.existsSync('exclusions.txt')) {
    exclusionsFile = 'exclusions.txt';
  }

  if (!exclusionsFile) {
    return null;
  }

  const rawPatterns = fs.readFileSync(exclusionsFile).toString();
  const blacklistedPatterns = rawPatterns
    .split('\n')
    .map(p => p.trim())
    .filter(p => p !== '');

  const unsafe = blacklistedPatterns.filter(pattern => !safe(pattern));
  if (unsafe.length > 0) {
    const unsafeExpressionsError = `Unsafe expressions detected: ${unsafe} Please revise ${exclusionsFile}`;
    throw new Error(unsafeExpressionsError);
  }

  return blacklistedPatterns;
};

export const isBlacklistedFileExtensions = (url, blacklistedFileExtensions) => {
  const urlExtension = url.split('.').pop();
  return blacklistedFileExtensions.includes(urlExtension);
};

const document = new JSDOM('').window;

const httpsAgent = new https.Agent({
  // Run in environments with custom certificates
  rejectUnauthorized: false,
});

export const messageOptions = {
  border: false,
  marginTop: 2,
  marginBottom: 2,
};

const urlOptions = {
  protocols: ['http', 'https'],
  require_protocol: true,
  require_tld: false,
};

const queryCheck = s => document.createDocumentFragment().querySelector(s);
export const isSelectorValid = selector => {
  try {
    queryCheck(selector);
  } catch (e) {
    return false;
  }
  return true;
};

// Refer to NPM validator's special characters under sanitizers for escape()
const blackListCharacters = '\\<>&\'"';

export const isValidXML = async content => {
  // fs.writeFileSync('sitemapcontent.txt', content);
  let status;
  let parsedContent = '';
  parseString(content, (err, result) => {
    if (result) {
      status = true;
      parsedContent = result;
    }
    if (err) {
      status = false;
    }
  });
  return { status, parsedContent };
};

export const isSkippedUrl = (pageUrl, whitelistedDomains) => {
  const matched =
    whitelistedDomains.filter(p => {
      const pattern = p.replace(/[\n\r]+/g, '');

      // is url
      if (pattern.startsWith('http') && pattern === pageUrl) {
        return true;
      }

      // is regex (default)
      return new RegExp(pattern).test(pageUrl);
    }).length > 0;

  return matched;
};

export const isFileSitemap = filePath => {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  const file = fs.readFileSync(filePath, 'utf8');
  return isSitemapContent(file);
};

export const getUrlMessage = scanner => {
  switch (scanner) {
    case constants.scannerTypes.website:
    case constants.scannerTypes.custom:
      return 'Please enter URL of website: ';
    case constants.scannerTypes.sitemap:
      return 'Please enter URL or file path to sitemap, or drag and drop a sitemap file here: ';

    default:
      return 'Invalid option';
  }
};

export const isInputValid = inputString => {
  if (!validator.isEmpty(inputString)) {
    const removeBlackListCharacters = validator.escape(inputString);

    if (validator.isAscii(removeBlackListCharacters)) {
      return true;
    }
  }

  return false;
};

export const sanitizeUrlInput = url => {
  // Sanitize that there is no blacklist characters
  const sanitizeUrl = validator.blacklist(url, blackListCharacters);
  const data = {};
  if (validator.isURL(sanitizeUrl, urlOptions)) {
    data.isValid = true;
  } else {
    data.isValid = false;
  }

  data.url = sanitizeUrl;
  return data;
};

const requestToUrl = async url => {
  // User-Agent is modified to emulate a browser to handle cases where some sites ban non browser agents, resulting in a 403 error
  const res = {};
  await axios
    .get(url, {
      headers: { 'User-Agent': devices['Desktop Chrome HiDPI'].userAgent },
      httpsAgent,
      timeout: 2000,
    })
    .then(async response => {
      const redirectUrl = response.request.res.responseUrl;
      res.status = constants.urlCheckStatuses.success.code;

      if (redirectUrl != null) {
        res.url = redirectUrl;
      } else {
        res.url = url;
      }

      res.content = response.data;
    })
    .catch(async error => {
      if (error.code === 'ECONNABORTED') {
        res.status = constants.urlCheckStatuses.axiosTimeout.code;
      } else if (error.response) {
        if (error.response.status === 401) {
          // enters here if URL is protected by basic auth
          res.status = constants.urlCheckStatuses.unauthorised.code;
        } else {
          // enters here if server responds with a status other than 2xx
          // the scan should still proceed even if error codes are received, so that accessibility scans for error pages can be done too
          res.status = constants.urlCheckStatuses.success.code;
        }
        res.url = url;
        res.content = error.response.data;
        return res;
      } else if (error.request) {
        // enters here if URL cannot be accessed
        res.status = constants.urlCheckStatuses.cannotBeResolved.code;
      } else {
        res.status = constants.urlCheckStatuses.systemError.code;
      }
      silentLogger.error(error);
    });
  return res;
};

const checkUrlConnectivity = async url => {
  const data = sanitizeUrlInput(url);

  if (data.isValid) {
    // Validate the connectivity of URL if the string format is url format
    const res = await requestToUrl(data.url);
    return res;
  }

  // reaches here if input is not a URL or not using http/https protocols
  return { status: constants.urlCheckStatuses.invalidUrl.code };
};

const checkUrlConnectivityWithBrowser = async (
  url,
  browserToRun,
  clonedDataDir,
  playwrightDeviceDetailsObject,
) => {
  const res = {};

  let viewport = null;
  let userAgent = null;

  if (Object.keys(playwrightDeviceDetailsObject).length > 0) {
    if ('viewport' in playwrightDeviceDetailsObject) {
      viewport = playwrightDeviceDetailsObject.viewport;
    }

    if ('userAgent' in playwrightDeviceDetailsObject) {
      userAgent = playwrightDeviceDetailsObject.userAgent;
    }
  }

  // Validate the connectivity of URL if the string format is url format
  const data = sanitizeUrlInput(url);

  if (data.isValid) {
    let browserContext;

    try {
      browserContext = await constants.launcher.launchPersistentContext(clonedDataDir, {
        ...getPlaywrightLaunchOptions(browserToRun),
        ...(viewport && { viewport }),
        ...(userAgent && { userAgent }),
      });
    } catch (err) {
      printMessage([`Unable to launch browser\n${err}`], messageOptions);
      res.status = constants.urlCheckStatuses.browserError.code;
      return res;
    }

    // const context = await browser.newContext();
    const page = await browserContext.newPage();

    // method will not throw an error when any valid HTTP status code is returned by the remote server, including 404 "Not Found" and 500 "Internal Server Error".
    // navigation to about:blank or navigation to the same URL with a different hash, which would succeed and return null.
    try {
      // playwright headless mode does not support navigation to pdf document
      if (isUrlPdf(url)) {
        // make http request to url to check
        return await requestToUrl(url);
      }

      const response = await page.goto(url, {
        timeout: 30000,
        ...(proxy && { waitUntil: 'commit' }),
      });

      try {
        await page.waitForLoadState('networkidle', { timeout: 10000 });
      } catch (e) {
        silentLogger.info('Unable to detect networkidle');
      }

      if (response.status() === 401) {
        res.status = constants.urlCheckStatuses.unauthorised.code;
      } else {
        res.status = constants.urlCheckStatuses.success.code;
      }

      // Check for redirect link
      const redirectUrl = await response.request().url();

      if (redirectUrl != null) {
        res.url = redirectUrl;
      } else {
        res.url = url;
      }

      res.content = await page.content();
    } catch (error) {
      silentLogger.error(error);
      res.status = constants.urlCheckStatuses.systemError.code;
    } finally {
      await browserContext.close();
    }
  } else {
    // enters here if input is not a URL or not using http/https protocols
    res.status = constants.urlCheckStatuses.invalidUrl.code;
  }

  return res;
};

export const isSitemapContent = async content => {
  const { status: isValid } = await isValidXML(content);
  if (isValid) {
    return true;
  }

  const regexForHtml = new RegExp('<(?:!doctype html|html|head|body)+?>', 'gmi');
  const regexForXmlSitemap = new RegExp('<(?:urlset|feed|rss)+?.*>', 'gmi');
  const regexForUrl = new RegExp('^.*(http|https):/{2}.*$', 'gmi');

  if (String(content).match(regexForHtml) && String(content).match(regexForXmlSitemap)) {
    // is an XML sitemap wrapped in a HTML document
    return true;
  }
  if (!String(content).match(regexForHtml) && String(content).match(regexForUrl)) {
    // treat this as a txt sitemap where all URLs will be extracted for crawling
    return true;
  }
  // is HTML webpage
  return false;
};

export const checkUrl = async (
  scanner,
  url,
  browser,
  clonedDataDir,
  playwrightDeviceDetailsObject,
) => {
  let res;
  if (proxy) {
    res = await checkUrlConnectivityWithBrowser(
      url,
      browser,
      clonedDataDir,
      playwrightDeviceDetailsObject,
    );
  } else {
    res = await checkUrlConnectivity(url);
    if (res.status === constants.urlCheckStatuses.axiosTimeout.code) {
      if (browser || constants.launcher === webkit) {
        res = await checkUrlConnectivityWithBrowser(
          url,
          browser,
          clonedDataDir,
          playwrightDeviceDetailsObject,
        );
      }
    }
  }

  if (
    res.status === constants.urlCheckStatuses.success.code &&
    scanner === constants.scannerTypes.sitemap
  ) {
    const isSitemap = await isSitemapContent(res.content);

    if (!isSitemap) {
      res.status = constants.urlCheckStatuses.notASitemap.code;
    }
  }
  return res;
};

const isEmptyObject = obj => !Object.keys(obj).length;

export const prepareData = argv => {
  if (isEmptyObject(argv)) {
    throw Error('No inputs should be provided');
  }
  const {
    scanner,
    headless,
    url,
    deviceChosen,
    customDevice,
    viewportWidth,
    playwrightDeviceDetailsObject,
    maxpages,
    strategy,
    isLocalSitemap,
    finalUrl,
    browserToRun,
    nameEmail,
    customFlowLabel,
    specifiedMaxConcurrency,
    needsReviewItems,
    fileTypes,
    blacklistedPatternsFilename,
    additional,
  } = argv;

  // construct filename for scan results
  const [date, time] = new Date().toLocaleString('sv').replaceAll(/-|:/g, '').split(' ');
  const domain = argv.isLocalSitemap ? 'custom' : new URL(argv.url).hostname;
  const sanitisedLabel = customFlowLabel ? `_${customFlowLabel.replaceAll(' ', '_')}` : '';
  const resultFilename = `${date}_${time}${sanitisedLabel}_${domain}`;

  return {
    type: scanner,
    url: isLocalSitemap ? url : finalUrl,
    isHeadless: headless,
    deviceChosen,
    customDevice,
    viewportWidth,
    playwrightDeviceDetailsObject,
    maxRequestsPerCrawl: maxpages || constants.maxRequestsPerCrawl,
    strategy,
    isLocalSitemap,
    browser: browserToRun,
    nameEmail,
    customFlowLabel,
    specifiedMaxConcurrency,
    needsReviewItems,
    randomToken: resultFilename,
    fileTypes,
    blacklistedPatternsFilename,
    includeScreenshots: !(additional === 'none'),
  };
};

export const getLinksFromSitemap = async (
  sitemapUrl,
  maxLinksCount,
  browser,
  userDataDirectory,
) => {
  const urls = {}; // dictionary of requests to urls to be scanned

  const isLimitReached = () => urls.size >= maxLinksCount;

  const addToUrlList = url => {
    if (!url) return;
    const request = new Request({ url });
    if (isUrlPdf(url)) {
      request.skipNavigation = true;
    }
    urls[url] = request;
  };

  const processXmlSitemap = async ($, sitemapType, selector) => {
    for (const urlElement of $(selector)) {
      if (isLimitReached()) {
        return;
      }
      let url;
      if (sitemapType === constants.xmlSitemapTypes.atom) {
        url = $(urlElement).prop('href');
      } else {
        url = $(urlElement).text();
      }
      addToUrlList(url);
    }
  };

  const processNonStandardSitemap = data => {
    const urlsFromData = crawlee.extractUrls({ string: data }).slice(0, maxLinksCount);
    urlsFromData.forEach(url => {
      addToUrlList(url);
    });
  };

  let finalUserDataDirectory = userDataDirectory;
  if (userDataDirectory === null || userDataDirectory === undefined) {
    finalUserDataDirectory = '';
  }

  const fetchUrls = async url => {
    let data;
    let sitemapType;

    const getDataUsingPlaywright = async () => {
      const browserContext = await constants.launcher.launchPersistentContext(
        finalUserDataDirectory,
        {
          ...getPlaywrightLaunchOptions(browser),
        },
      );

      const page = await browserContext.newPage();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      if (constants.launcher === webkit) {
        data = await page.locator('body').innerText();
      } else {
        const urlSet = page.locator('urlset');
        const sitemapIndex = page.locator('sitemapindex');
        const rss = page.locator('rss');
        const feed = page.locator('feed');
        const isRoot = async locator => (await locator.count()) > 0;

        if (await isRoot(urlSet)) {
          data = await urlSet.evaluate(elem => elem.outerHTML);
        } else if (await isRoot(sitemapIndex)) {
          data = await sitemapIndex.evaluate(elem => elem.outerHTML);
        } else if (await isRoot(rss)) {
          data = await rss.evaluate(elem => elem.outerHTML);
        } else if (await isRoot(feed)) {
          data = await feed.evaluate(elem => elem.outerHTML);
        }
      }

      await browserContext.close();
    };

    if (validator.isURL(url, urlOptions)) {
      if (isUrlPdf(url)) {
        addToUrlList(url);
        return;
      }
      if (proxy) {
        await getDataUsingPlaywright();
      } else {
        try {
          const instance = axios.create({
            httpsAgent: new https.Agent({
              rejectUnauthorized: false,
            }),
          });
          data = await (await instance.get(url, { timeout: 2000 })).data;
        } catch (error) {
          if (error.code === 'ECONNABORTED') {
            await getDataUsingPlaywright();
          }
        }
      }
    } else {
      data = fs.readFileSync(url, 'utf8');
    }
    const $ = cheerio.load(data, { xml: true });

    // This case is when the document is not an XML format document
    if ($(':root').length === 0) {
      processNonStandardSitemap(data);
      return;
    }

    // Root element
    const root = $(':root')[0];

    const { xmlns } = root.attribs;
    const xmlFormatNamespace = 'http://www.sitemaps.org/schemas/sitemap/0.9';

    if (root.name === 'urlset' && xmlns === xmlFormatNamespace) {
      sitemapType = constants.xmlSitemapTypes.xml;
    } else if (root.name === 'sitemapindex' && xmlns === xmlFormatNamespace) {
      sitemapType = constants.xmlSitemapTypes.xmlIndex;
    } else if (root.name === 'rss') {
      sitemapType = constants.xmlSitemapTypes.rss;
    } else if (root.name === 'feed') {
      sitemapType = constants.xmlSitemapTypes.atom;
    } else {
      sitemapType = constants.xmlSitemapTypes.unknown;
    }

    switch (sitemapType) {
      case constants.xmlSitemapTypes.xmlIndex:
        silentLogger.info(`This is a XML format sitemap index.`);
        for (const childSitemapUrl of $('loc')) {
          if (isLimitReached()) {
            break;
          }
          await fetchUrls($(childSitemapUrl, false).text());
        }
        break;
      case constants.xmlSitemapTypes.xml:
        silentLogger.info(`This is a XML format sitemap.`);
        await processXmlSitemap($, sitemapType, 'loc');
        break;
      case constants.xmlSitemapTypes.rss:
        silentLogger.info(`This is a RSS format sitemap.`);
        await processXmlSitemap($, sitemapType, 'link');
        break;
      case constants.xmlSitemapTypes.atom:
        silentLogger.info(`This is a Atom format sitemap.`);
        await processXmlSitemap($, sitemapType, 'link');
        break;
      default:
        silentLogger.info(`This is an unrecognised XML sitemap format.`);
        processNonStandardSitemap(data);
    }
  };

  await fetchUrls(sitemapUrl);
  const requestList = Object.values(urls);
  return requestList;
};

export const validEmail = email => {
  const emailRegex = new RegExp(/^[A-Za-z0-9_!#$%&'*+\/=?`{|}~^.-]+@[A-Za-z0-9.-]+$/, 'gm');

  return emailRegex.test(email);
};

// For new user flow.
export const validName = name => {
  const maxLength = 50;
  const regex = /^[A-Za-z-,\s]+$/;

  if (name.length > maxLength) {
    return false; // Reject names exceeding maxlength
  }

  if (!regex.test(name)) {
    return false; // Reject names with non-alphabetic or non-whitespace characters
  }

  return true;
};

/**
 * Check for browser available to run scan and clone data directory of the browser if needed.
 * @param {*} preferredBrowser string of user's preferred browser
 * @param {*} isCli boolean flag to indicate if function is called from cli
 * @returns object consisting of browser to run and cloned data directory
 */
export const getBrowserToRun = (preferredBrowser, isCli) => {
  if (preferredBrowser === constants.browserTypes.chrome) {
    const chromeData = getChromeData();
    if (chromeData) return chromeData;

    if (os.platform() === 'darwin') {
      // mac user who specified -b chrome but does not have chrome
      if (isCli) printMessage(['Unable to use Chrome, falling back to webkit...'], messageOptions);

      constants.launcher = webkit;
      return { browserToRun: null, clonedBrowserDataDir: '' };
    } else {
      if (isCli)
        printMessage(['Unable to use Chrome, falling back to Edge browser...'], messageOptions);

      const edgeData = getEdgeData();
      if (edgeData) return edgeData;

      if (isCli)
        printMessage(['Unable to use both Chrome and Edge. Please try again.'], messageOptions);
      process.exit(constants.urlCheckStatuses.browserError.code);
    }
  } else if (preferredBrowser === constants.browserTypes.edge) {
    const edgeData = getEdgeData();
    if (edgeData) return edgeData;

    if (isCli)
      printMessage(['Unable to use Edge, falling back to Chrome browser...'], messageOptions);
    const chromeData = getChromeData();
    if (chromeData) return chromeData;

    if (os.platform() === 'darwin') {
      //  mac user who specified -b edge but does not have edge or chrome
      if (isCli)
        printMessage(['Unable to use Chrome and Edge, falling back to webkit...'], messageOptions);

      constants.launcher = webkit;
      return { browserToRun: null, clonedBrowserDataDir: '' };
    } else {
      if (isCli)
        printMessage(['Unable to use both Chrome and Edge. Please try again.'], messageOptions);
      process.exit(constants.urlCheckStatuses.browserError.code);
    }
  } else {
    // defaults to chromium
    return { browserToRun: constants.browserTypes.chromium, clonedBrowserDataDir: '' };
  }
};
/**
 * Cloning a second time with random token for parallel browser sessions
 * Also To mitigate agaisnt known bug where cookies are
 * overriden after each browser session - i.e. logs user out
 * after checkingUrl and unable to utilise same cookie for scan
 * */
export const getClonedProfilesWithRandomToken = (browser, randomToken) => {
  let clonedDataDir;
  if (browser === constants.browserTypes.chrome) {
    clonedDataDir = cloneChromeProfiles(randomToken);
  } else if (browser === constants.browserTypes.edge) {
    clonedDataDir = cloneEdgeProfiles(randomToken);
  } else {
    clonedDataDir = '';
  }
  return clonedDataDir;
};

export const getChromeData = () => {
  const browserDataDir = getDefaultChromeDataDir();
  const clonedBrowserDataDir = cloneChromeProfiles();
  if (browserDataDir && clonedBrowserDataDir) {
    const browserToRun = constants.browserTypes.chrome;
    return { browserToRun, clonedBrowserDataDir };
  } else {
    return null;
  }
};

export const getEdgeData = () => {
  const browserDataDir = getDefaultEdgeDataDir();
  const clonedBrowserDataDir = cloneEdgeProfiles();
  console.log(browserDataDir, clonedBrowserDataDir, 'getEdgeData');
  if (browserDataDir && clonedBrowserDataDir) {
    const browserToRun = constants.browserTypes.edge;
    return { browserToRun, clonedBrowserDataDir };
  }
};

/**
 * Clone the Chrome profile cookie files to the destination directory
 * @param {*} options glob options object
 * @param {*} destDir destination directory
 * @returns boolean indicating whether the operation was successful
 */
const cloneChromeProfileCookieFiles = (options, destDir) => {
  let profileCookiesDir;
  // Cookies file per profile is located in .../User Data/<profile name>/Network/Cookies for windows
  // and ../Chrome/<profile name>/Cookies for mac
  let profileNamesRegex;
  if (os.platform() === 'win32') {
    profileCookiesDir = globSync('**/Network/Cookies', {
      ...options,
      ignore: ['Purple-HATS/**'],
    });
    profileNamesRegex = /User Data\\(.*?)\\Network/;
  } else if (os.platform() === 'darwin') {
    // maxDepth 2 to avoid copying cookies from the Purple-HATS directory if it exists
    profileCookiesDir = globSync('**/Cookies', {
      ...options,
      ignore: 'Purple-HATS/**',
    });
    profileNamesRegex = /Chrome\/(.*?)\/Cookies/;
  }

  if (profileCookiesDir.length > 0) {
    let success = true;
    profileCookiesDir.forEach(dir => {
      const profileName = dir.match(profileNamesRegex)[1];
      if (profileName) {
        let destProfileDir = path.join(destDir, profileName);
        if (os.platform() === 'win32') {
          destProfileDir = path.join(destProfileDir, 'Network');
        }
        // Recursive true to create all parent directories (e.g. PbProfile/Default/Cookies)
        if (!fs.existsSync(destProfileDir)) {
          fs.mkdirSync(destProfileDir, { recursive: true });
          if (!fs.existsSync(destProfileDir)) {
            fs.mkdirSync(destProfileDir);
          }
        }

        // Prevents duplicate cookies file if the cookies already exist
        if (!fs.existsSync(path.join(destProfileDir, 'Cookies'))) {
          try {
            fs.copyFileSync(dir, path.join(destProfileDir, 'Cookies'));
          } catch (err) {
            silentLogger.error(err);
            printMessage([err], messageOptions);
            success = false;
          }
        }
      }
    });
    return success;
  }

  silentLogger.warn('Unable to find Chrome profile cookies file in the system.');
  printMessage(['Unable to find Chrome profile cookies file in the system.'], messageOptions);
  return false;
};

/**
 * Clone the Chrome profile cookie files to the destination directory
 * @param {*} options glob options object
 * @param {*} destDir destination directory
 * @returns boolean indicating whether the operation was successful
 */
const cloneEdgeProfileCookieFiles = (options, destDir) => {
  let profileCookiesDir;
  // Cookies file per profile is located in .../User Data/<profile name>/Network/Cookies for windows
  // and ../Chrome/<profile name>/Cookies for mac
  let profileNamesRegex;
  // Ignores the cloned Purple-HATS directory if exists
  if (os.platform() === 'win32') {
    profileCookiesDir = globSync('**/Network/Cookies', {
      ...options,
      ignore: 'Purple-HATS/**',
    });
    profileNamesRegex = /User Data\\(.*?)\\Network/;
  } else if (os.platform() === 'darwin') {
    // Ignores copying cookies from the Purple-HATS directory if it exists
    profileCookiesDir = globSync('**/Cookies', {
      ...options,
      ignore: 'Purple-HATS/**',
    });
    profileNamesRegex = /Microsoft Edge\/(.*?)\/Cookies/;
  }

  if (profileCookiesDir.length > 0) {
    let success = true;
    profileCookiesDir.forEach(dir => {
      const profileName = dir.match(profileNamesRegex)[1];
      if (profileName) {
        let destProfileDir = path.join(destDir, profileName);
        if (os.platform() === 'win32') {
          destProfileDir = path.join(destProfileDir, 'Network');
        }
        // Recursive true to create all parent directories (e.g. PbProfile/Default/Cookies)
        if (!fs.existsSync(destProfileDir)) {
          fs.mkdirSync(destProfileDir, { recursive: true });
          if (!fs.existsSync(destProfileDir)) {
            fs.mkdirSync(destProfileDir);
          }
        }

        // Prevents duplicate cookies file if the cookies already exist
        if (!fs.existsSync(path.join(destProfileDir, 'Cookies'))) {
          try {
            fs.copyFileSync(dir, path.join(destProfileDir, 'Cookies'));
          } catch (err) {
            silentLogger.error(err);
            printMessage([err], messageOptions);
            success = false;
          }
        }
      }
    });
    return success;
  }
  silentLogger.warn('Unable to find Edge profile cookies file in the system.');
  printMessage(['Unable to find Edge profile cookies file in the system.'], messageOptions);
  return false;
};

/**
 * Both Edge and Chrome Local State files are located in the .../User Data directory
 * @param {*} options - glob options object
 * @param {string} destDir - destination directory
 * @returns boolean indicating whether the operation was successful
 */
const cloneLocalStateFile = (options, destDir) => {
  const localState = globSync('**/*Local State', {
    ...options,
    maxDepth: 1,
  });

  if (localState.length > 0) {
    let success = true;
    localState.forEach(dir => {
      try {
        fs.copyFileSync(dir, path.join(destDir, 'Local State'));
      } catch (err) {
        silentLogger.error(err);
        printMessage([err], messageOptions);
        success = false;
      }
    });
    return success;
  }
  silentLogger.warn('Unable to find local state file in the system.');
  printMessage(['Unable to find local state file in the system.'], messageOptions);
  return false;
};

/**
 * Checks if the Chrome data directory exists and creates a clone
 * of all profile within the Purple-HATS directory located in the
 * .../User Data directory for Windows and
 * .../Chrome directory for Mac.
 * @param {string} randomToken - random token to append to the cloned directory
 * @returns {string} cloned data directory, null if any of the sub files failed to copy
 */
export const cloneChromeProfiles = randomToken => {
  const baseDir = getDefaultChromeDataDir();

  if (!baseDir) {
    return;
  }

  let destDir;

  if (randomToken) {
    destDir = path.join(baseDir, `Purple-HATS-${randomToken}`);
  } else {
    destDir = path.join(baseDir, 'Purple-HATS');
  }

  if (fs.existsSync(destDir)) {
    deleteClonedChromeProfiles();
  }

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir);
  }

  const baseOptions = {
    cwd: baseDir,
    recursive: true,
    absolute: true,
    nodir: true,
  };
  const cloneLocalStateFileSucess = cloneLocalStateFile(baseOptions, destDir);
  if (cloneChromeProfileCookieFiles(baseOptions, destDir) && cloneLocalStateFileSucess) {
    return destDir;
  }

  return null;
};

/**
 * Checks if the Edge data directory exists and creates a clone
 * of all profile within the Purple-HATS directory located in the
 * .../User Data directory for Windows and
 * .../Microsoft Edge directory for Mac.
 * @param {string} randomToken - random token to append to the cloned directory
 * @returns {string} cloned data directory, null if any of the sub files failed to copy
 */
export const cloneEdgeProfiles = randomToken => {
  const baseDir = getDefaultEdgeDataDir();

  if (!baseDir) {
    return;
  }

  let destDir;

  if (randomToken) {
    destDir = path.join(baseDir, `Purple-HATS-${randomToken}`);
  } else {
    destDir = path.join(baseDir, 'Purple-HATS');
  }

  if (fs.existsSync(destDir)) {
    deleteClonedEdgeProfiles();
  }

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir);
  }

  const baseOptions = {
    cwd: baseDir,
    recursive: true,
    absolute: true,
    nodir: true,
  };

  console.log(destDir, 'destDir');
  const cloneLocalStateFileSucess = cloneLocalStateFile(baseOptions, destDir);
  console.log(cloneLocalStateFileSucess, 'cloneLocalStateFileSuccess');
  if (cloneEdgeProfileCookieFiles(baseOptions, destDir) && cloneLocalStateFileSucess) {
    return destDir;
  }

  return null;
};

export const deleteClonedProfiles = browser => {
  if (browser === constants.browserTypes.chrome) {
    deleteClonedChromeProfiles();
  } else if (browser === constants.browserTypes.edge) {
    deleteClonedEdgeProfiles();
  }
};

/**
 * Deletes all the cloned Purple-HATS directories in the Chrome data directory
 * @returns null
 */
export const deleteClonedChromeProfiles = () => {
  const baseDir = getDefaultChromeDataDir();

  if (!baseDir) {
    return;
  }

  // Find all the Purple-HATS directories in the Chrome data directory
  const destDir = globSync('**/Purple-HATS*', {
    cwd: baseDir,
    recursive: true,
    absolute: true,
  });

  if (destDir.length > 0) {
    destDir.forEach(dir => {
      if (fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true });
        } catch (err) {
          silentLogger.warn(`Unable to delete ${dir} folder in the Chrome data directory. ${err}`);
          console.warn(`Unable to delete ${dir} folder in the Chrome data directory. ${err}}`);
        }
      }
    });
    return;
  }

  silentLogger.warn('Unable to find Purple-HATS directory in the Chrome data directory.');
  console.warn('Unable to find Purple-HATS directory in the Chrome data directory.');
};

/**
 * Deletes all the cloned Purple-HATS directories in the Edge data directory
 * @returns null
 */
export const deleteClonedEdgeProfiles = () => {
  const baseDir = getDefaultEdgeDataDir();

  if (!baseDir) {
    console.warn(`Unable to find Edge data directory in the system.`);
    return;
  }

  // Find all the Purple-HATS directories in the Chrome data directory
  const destDir = globSync('**/Purple-HATS*', {
    cwd: baseDir,
    recursive: true,
    absolute: true,
  });

  if (destDir.length > 0) {
    destDir.forEach(dir => {
      if (fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true });
        } catch (err) {
          silentLogger.warn(`Unable to delete ${dir} folder in the Chrome data directory. ${err}`);
          console.warn(`Unable to delete ${dir} folder in the Chrome data directory. ${err}}`);
        }
      }
    });
  }
};

export const getPlaywrightDeviceDetailsObject = (deviceChosen, customDevice, viewportWidth) => {
  let playwrightDeviceDetailsObject = {};
  if (deviceChosen === 'Mobile' || customDevice === 'iPhone 11') {
    playwrightDeviceDetailsObject = devices['iPhone 11'];
  } else if (customDevice === 'Samsung Galaxy S9+') {
    playwrightDeviceDetailsObject = devices['Galaxy S9+'];
  } else if (viewportWidth) {
    playwrightDeviceDetailsObject = {
      viewport: { width: Number(viewportWidth), height: 720 },
    };
  } else if (customDevice) {
    playwrightDeviceDetailsObject = devices[customDevice.replace('_', / /g)];
  }
  return playwrightDeviceDetailsObject;
};

export const getScreenToScan = (deviceChosen, customDevice, viewportWidth) => {
  let screenToScan;
  if (deviceChosen) {
    screenToScan = deviceChosen;
  } else if (customDevice) {
    screenToScan = customDevice;
  } else if (viewportWidth) {
    screenToScan = `CustomWidth_${viewportWidth}px`;
  } else {
    screenToScan = 'Desktop';
  }
  return screenToScan;
};

export const submitFormViaPlaywright = async (browserToRun, userDataDirectory, finalUrl) => {
  let browserContext;
  const dirName = `clone-${Date.now()}`;
  let clonedDir = null;
  if (proxy && browserToRun === constants.browserTypes.edge) {
    clonedDir = cloneEdgeProfiles(dirName);
  } else if (proxy && browserToRun === constants.browserTypes.chrome) {
    clonedDir = cloneChromeProfiles(dirName);
  }
  browserContext = await constants.launcher.launchPersistentContext(
    clonedDir || userDataDirectory,
    {
      ...getPlaywrightLaunchOptions(browserToRun),
    },
  );

  const page = await browserContext.newPage();

  try {
    const response = await page.goto(finalUrl, {
      timeout: 30000,
      ...(proxy && { waitUntil: 'commit' }),
    });

    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch (e) {
      silentLogger.info('Unable to detect networkidle');
    }
  } catch (error) {
    silentLogger.error(error);
  } finally {
    await browserContext.close();
    if (proxy && browserToRun === constants.browserTypes.edge) {
      deleteClonedEdgeProfiles();
    } else if (proxy && browserToRun === constants.browserTypes.chrome) {
      deleteClonedChromeProfiles();
    }
  }
};

export const submitForm = async (
  browserToRun,
  userDataDirectory,
  websiteUrl,
  scanType,
  email,
  name,
  scanResultsJson,
  numberOfPagesScanned,
) => {
  const finalUrl =
    `${formDataFields.formUrl}?` +
    `${formDataFields.websiteUrlField}=${websiteUrl}&` +
    `${formDataFields.scanTypeField}=${scanType}&` +
    `${formDataFields.emailField}=${email}&` +
    `${formDataFields.nameField}=${name}&` +
    `${formDataFields.resultsField}=${encodeURIComponent(scanResultsJson)}&` +
    `${formDataFields.numberOfPagesScannedField}=${numberOfPagesScanned}`;

  if (proxy) {
    await submitFormViaPlaywright(browserToRun, userDataDirectory, finalUrl);
  } else {
    try {
      await axios.get(finalUrl, { timeout: 2000 });
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        if (browserToRun || constants.launcher === webkit) {
          await submitFormViaPlaywright(browserToRun, userDataDirectory, finalUrl);
        }
      }
    }
  }
};
/**
 * @param {string} browser browser name ("chrome" or "edge", null for chromium, the default Playwright browser)
 * @returns playwright launch options object. For more details: https://playwright.dev/docs/api/class-browsertype#browser-type-launch
 */
export const getPlaywrightLaunchOptions = browser => {
  let channel;
  if (browser) {
    channel = browser;
  }
  const options = {
    // Drop the --use-mock-keychain flag to allow MacOS devices
    // to use the cloned cookies.
    ignoreDefaultArgs: ['--use-mock-keychain'],
    args: constants.launchOptionsArgs,
    ...(channel && { channel }), // Having no channel is equivalent to "chromium"
  };
  if (proxy) {
    options.headless = false;
    options.slowMo = 1000; // To ensure server-side rendered proxy page is loaded
  } else if (browser === constants.browserTypes.edge && os.platform() === 'win32') {
    // edge should be in non-headless mode
    options.headless = false;
  }
  return options;
};
