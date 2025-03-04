// import { JSDOM } from "jsdom";
import { silentLogger } from '../logs.js';

export const takeScreenshotForHTMLElements = async (violations, page, randomToken) => {
    let newViolations = [];
    for (const violation of violations) {
        const { id: rule } = violation; 
        let newViolationNodes = [];
        for (const node of violation.nodes) {
            const { html, target, impact } = node; 
            const selector = target.length === 1 ? target[0] : null; 
            if (selector) {
                try {
                    const screenshotPath = generateScreenshotPath(page.url(), impact, rule, newViolationNodes.length);
                    const locator = await getLocator(page, selector, html);
                    await locator.screenshot({ path: `${randomToken}/${screenshotPath}` });
                    node.screenshotPath = screenshotPath; 
                } catch (e) {
                    silentLogger.error(e);
                }
            }
            newViolationNodes.push(node);
        }
        violation.nodes = newViolationNodes;
        newViolations.push(violation);
    }
    return newViolations;
}
  
const getLocator = async (page, selector, html) => {
    let locator;
    if (selector.includes('>')) {
        const selectors = selector.split('>');  
        locator = page.locator(selectors[0].trim());
        for (let i = 1; i < selectors.length; i++) {
            locator = locator.filter({ has: page.locator(selectors[i].trim())});
        }
    } else {
        locator = page.locator(selector);
    }
    return locator;
}

const generateScreenshotPath = (url, impact, rule, index) => {
    const pathname = new URL(url).pathname?.replaceAll('/', '-').replace('-', '');
    const domain = pathname === '' ? new URL(url).hostname : pathname;
    const category = impact === 'critical' || impact === 'serious' ? 'mustFix' : 'goodToFix';
    const screenshotPath = `elemScreenshots/html/${domain}-${category}-${rule}-${index}.png`;
    return screenshotPath; 
}

// const hasMultipleLocators = async (locator) => await locator.count() > 1;
  
// const resolveMultipleLocators = async (page, locator, html) => {
//     const { tag, classAttrib, hrefAttrib, textContent } = generateAttribs(html);
    
//     const allLocators = await locator.all();
//     // console.log('locator before: ', locator);
//     allLocators.forEach(async currLocator => {
//         console.log('curr locator: ', currLocator);
//         let hrefIsExactMatch, containsTextContent; 
//         // if (hrefAttrib) hrefIsExactMatch = (await currLocator.getAttribute('href')) === hrefAttrib; 
//         if (textContent) containsTextContent = (await currLocator.innerText()).includes(textContent);
       
//         // if (hrefAttrib && textContent) {
//         //     if (hrefIsExactMatch && containsTextContent) {
//         //         locator = currLocator; 
//         //         console.log('1: ', locator);
//         //     }
//         // } else if (hrefAttrib) {
//         //     if (hrefIsExactMatch) {
//         //         locator = currLocator; 
//         //         console.log('2: ', locator);
//         //     }
//         // } else 

//         if (textContent) {
//             if (containsTextContent) {
//                 locator = currLocator; 
//                 console.log('3: ', locator);
//             }
//         } else {
//             locator = null;
//         }
//     })
//     console.log('final locator: ', locator);
//     return locator;
//  }

// const generateAttribs = (html) => {
//     const processedHTMLString = html.replaceAll('\n', ''); 
//     const tagNamesRegex =  /(?<=[<])\s*([a-zA-Z][^\s>/]*)\b/g;
//     const tag = processedHTMLString.match(tagNamesRegex)[0];

//     const dom = new JSDOM(processedHTMLString); 
//     const elem = dom.window.document.querySelector(tag); 

//     const textContent = elem.textContent.trim();
//     const classAttrib = elem.getAttribute('class')?.trim();
//     const hrefAttrib = (tag === 'a') ? elem.getAttribute('href') : null; 
//     console.log('text content: ', textContent); 

//     return {
//         tag,
//         ...(classAttrib && {classAttrib}), 
//         ...(hrefAttrib && {hrefAttrib}),
//         ...(textContent && {textContent})
//     }
// }


// export const takeScreenshotForHTMLElements = async (screenshotData, storagePath, browserToRun) => {
//     const screenshotDir = `${storagePath}/reports/screenshots`;
//     let screenshotItems = [];
//     let randomToken = `cloned-${Date.now()}`; 
//     const clonedDir = getClonedProfilesWithRandomToken(browserToRun, randomToken);
//     const browser = await constants.launcher.launchPersistentContext(
//         clonedDir,
//         {
//             headless: false, 
//             ...getPlaywrightLaunchOptions(browserToRun)
//         }
//     ); 
    
//     for (const item of screenshotData) {
//           const domain = item.url.replaceAll("https://", '').replaceAll('/', '_');
//           item.htmlItems = generateSelectors(item.htmlItems);
//           const page = await browser.newPage(); 
//           await page.goto(item.url); 
//           let htmlItemsWithScreenshotPath = [];
//           for (const htmlItem of item.htmlItems) {
//               const { rule, category, selector } = htmlItem; 
//               const locator = await getLocators(page, selector); 
//               const screenshotFilePath = `${domain}/${category}/${rule}/${selector.tag}-${htmlItemsWithScreenshotPath.length}.png`;
//               if (locator) {
//                   await locator.screenshot({ path: `${screenshotDir}/${screenshotFilePath}` });   
//                   htmlItem.screenshotPath = `screenshots/${screenshotFilePath}`; 
//               }
//               delete htmlItem.selector;
//               htmlItemsWithScreenshotPath.push(htmlItem);
//           }
//           screenshotItems.push({url: item.url, htmlItems: htmlItemsWithScreenshotPath});
//           await page.close();
//       } 
//       await browser.close();
//       deleteClonedProfiles(browserToRun)
//       return screenshotItems;
//   }
  
//   export const processScreenshotData = (allIssues) => {
//     const scannedUrls = allIssues.pagesScanned.map(page => page.url);
//     const screenshotData = scannedUrls.map(scannedUrl => {
//         let htmlItems = []; 
//         ['mustFix', 'goodToFix'].map((category) => {
//             const ruleItems = allIssues.items[category].rules; 
//             ruleItems.map(ruleItem => {
//                 const { rule, pagesAffected } = ruleItem; 
//                 pagesAffected.map(affectedPage => {
//                     const { url, items } = affectedPage; 
//                     if (scannedUrl === url) {
//                         items.forEach(item => {if (item.html) htmlItems.push({html: item.html, rule, category})});
//                     }
//                 })
//             })
//         })
//         return {url: scannedUrl, htmlItems};
//     })
//     return screenshotData;
// }

// export const getScreenshotPaths = (screenshotItems, allIssues) => {
//     screenshotItems.forEach(screenshotItem => {
//         const { url: ssUrl, htmlItems: ssHtmlItems } = screenshotItem;
//         ssHtmlItems.map(ssHtmlItem => {
//           const { 
//             category: ssCategory, 
//             rule: ssRule, 
//             html: ssHtml, 
//             screenshotPath: ssPath 
//           } = ssHtmlItem; 
//           allIssues.items[ssCategory].rules = allIssues.items[ssCategory].rules
//             .map(ruleItem => {
//               const { rule, pagesAffected } = ruleItem; 
//                 if (rule === ssRule) {
//                   ruleItem.pagesAffected = pagesAffected.map(affectedPage => {
//                     const { url, items } = affectedPage;
//                     if (ssUrl === url) {
//                       affectedPage.items = items.map(htmlItem => {
//                         const { html } = htmlItem; 
//                         if (ssHtml === html) htmlItem.screenshotPath = ssPath;
//                         return htmlItem;
//                       })
//                     }
//                     return affectedPage;
//                   })
//                 }
//                 return ruleItem;
//             })
//         }) 
//     });
// }

// const generateSelectors = (htmlItems) => {
//     const htmlItemsWithSelectors = htmlItems.map((htmlItem) => {
//         const { html } = htmlItem; 
//         const processedHTMLString = html.replaceAll('\n', '');
//         const tagnameRegex =  /(?<=[<])\s*([a-zA-Z][^\s>/]*)\b/g;
//         const tagNames = processedHTMLString.match(tagnameRegex);
        
//         const dom = new JSDOM(processedHTMLString);
//         const tag = tagNames[0]
//         const elem = dom.window.document.querySelector(tag);

//         const classAttrib = elem.getAttribute('class')?.trim(); 
//         const idAttrib = elem.getAttribute('id'); 
//         const titleAttrib = elem.getAttribute('title'); 
//         const placeholderAttrib = elem.getAttribute('placeholder'); 
//         const altAttrib = (tag === 'img') ? elem.getAttribute('alt') : null;
//         const hrefAttrib = (tag === 'a') ? elem.getAttribute('href') : null; 

//         let children; 
//         if (tagNames.length > 1) {
//             const childrenHTMLItems = Array.from(elem.children).map(child => {
//                 return {
//                     html: child.outerHTML, 
//                     rule: htmlItem.rule, 
//                     category: htmlItem.category
//                 }
//             }); 
//             children = generateSelectors(childrenHTMLItems);
//         }

//         let textContent = elem.textContent.trim(); 
//         let allTextContents = [];
//         children?.map((child) => { 
//             if (child?.selector.allTextContents) allTextContents = [...allTextContents, ...child.selector.allTextContents]
//         })

//         if (allTextContents.includes(textContent)) {
//             textContent = null; 
//         } else {
//             if (textContent) allTextContents = [textContent, ...allTextContents];
//         }
        
//         const selector = {
//             tag,
//             processedHTMLString,
//             ...(textContent && {textContent}),
//             ...(allTextContents.length > 0 && {allTextContents}),
//             ...(classAttrib && {classAttrib}),
//             ...(idAttrib && {idAttrib}),
//             ...(titleAttrib && {titleAttrib}), 
//             ...(placeholderAttrib && {placeholderAttrib}),
//             ...(altAttrib && {altAttrib}),
//             ...(hrefAttrib && {hrefAttrib}),
//             ...(children && {children}),
//         }

//         htmlItem.selector = selector; 
//         return htmlItem;
//     })
//     return htmlItemsWithSelectors;
// }

// const generateInitialLocator = (page, selector) => {
//     const {
//         tag, 
//         textContent, 
//         classAttrib, 
//         idAttrib, 
//         titleAttrib, 
//         placeholderAttrib, 
//         altAttrib,
//         children    
//     } = selector; 

//     let locator = page.locator(tag);
//     if (classAttrib) {
//         const classSelector = classAttrib.replaceAll(/\s+/g, '.').replace(/^/, '.').replaceAll(':', '\\:').replaceAll('(', '\\(').replaceAll(')', '\\)');
//         locator = locator.and(page.locator(classSelector))
//     }
//     if (idAttrib) locator = locator.and(page.locator(`#${idAttrib}`));
//     if (textContent) locator = locator.and(page.getByText(textContent));
//     if (titleAttrib) locator = locator.and(page.getByTitle(titleAttrib)); 
//     if (placeholderAttrib) locator = locator.and(page.getByPlaceHolder(placeholderAttrib));
//     if (altAttrib) locator = locator.and(page.getByAltText(altAttrib)); 

//     if (children) {
//         let currLocator = locator; 
//         for (const child of children) {
//             const childLocator = generateInitialLocator(page, child.selector);
//             locator = locator.and(currLocator.filter({ has: childLocator })); // figure this out tmr!
//         }
//     }
//     return locator;
// }

// const resolveLocators = async (locator, classAttrib, hrefAttrib) => {
//     const locatorCount = await locator.count(); 
//     if (locatorCount > 1) {
//         let locators = []; 
//         const allLocators = await locator.all(); 
//         for (let nth = 0; nth < locatorCount; nth++) {
//             const currLocator = allLocators[nth];
//             const isVisible = await currLocator.isVisible();
//             if (isVisible) {
//                 let classIsExactMatch, hrefIsExactMatch; 
//                 if (classAttrib) classIsExactMatch = (await currLocator.getAttribute('class')) === classAttrib;
//                 if (hrefAttrib) hrefIsExactMatch = (await currLocator.getAttribute('href')) === hrefAttrib;  

//                 if (classAttrib && hrefAttrib) {
//                     if (classIsExactMatch && hrefIsExactMatch) locators.push(currLocator); 
//                 } else if (classAttrib) {
//                     if (classIsExactMatch) locators.push(currLocator);
//                 } else if (hrefAttrib) {
//                     if (hrefIsExactMatch) locators.push(currLocator);
//                 } else {
//                     locators.push(currLocator);
//                 }     
//             }
//         }
//         return locators.length === 1 ? locators[0] : null; 
//     } else {
//         return locator;
//     }
// } 

// const getLocators = async (page, selector) => {
//     const locator = generateInitialLocator(page, selector); 
//     const locators = await resolveLocators(locator, selector.classAttrib, selector.hrefAttrib);
//     return locators;
// }