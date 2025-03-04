/* eslint-disable no-unused-vars */
/* eslint-disable no-param-reassign */
import crawlee, { playwrightUtils } from 'crawlee';
import axe from 'axe-core';
import { axeScript, guiInfoStatusTypes, saflyIconSelector } from '../constants/constants.js';
import { guiInfoLog } from '../logs.js';
import { takeScreenshotForHTMLElements } from '../screenshotFunc/htmlScreenshotFunc.js';
import fs from 'fs';

export const filterAxeResults = (needsReview, results, pageTitle) => {
  const { violations, passes, incomplete, url } = results;

  let totalItems = 0;
  const mustFix = { totalItems: 0, rules: {} };
  const goodToFix = { totalItems: 0, rules: {} };
  const passed = { totalItems: 0, rules: {} };

  const process = (item, displayNeedsReview) => {
    const { id: rule, help: description, helpUrl, tags, nodes } = item;

    if (rule === 'frame-tested') return;

    const conformance = tags.filter(tag => tag.startsWith('wcag') || tag === 'best-practice');
    // handle rare cases where conformance level is not the first element
    const levels = ['wcag2a', 'wcag2aa', 'wcag2aaa'];
    if (conformance[0] !== 'best-practice' && !levels.includes(conformance[0])) {
      conformance.sort((a, b) => {
        if (levels.includes(a)) {
          return -1;
        } else if (levels.includes(b)) {
          return 1;
        }

        return 0;
      });
    }

    const addTo = (category, node) => {
      const { html, failureSummary, screenshotPath } = node;
      if (!(rule in category.rules)) {
        category.rules[rule] = { description, helpUrl, conformance, totalItems: 0, items: [] };
      }
      const message = displayNeedsReview
        ? failureSummary.slice(failureSummary.indexOf('\n') + 1).trim()
        : failureSummary;
      // add in screenshot path 
      category.rules[rule].items.push(
        displayNeedsReview ? { html, message, screenshotPath, displayNeedsReview } : { html, message, screenshotPath },
      );
      category.rules[rule].totalItems += 1;
      category.totalItems += 1;
      totalItems += 1;
    };

    nodes.forEach(node => {
      const { impact } = node;
      if (impact === 'critical' || impact === 'serious') {
        addTo(mustFix, node);
      } else {
        addTo(goodToFix, node);
      }
    });
  };

  violations.forEach(item => process(item, false));
  if (needsReview) {
    incomplete.forEach(item => process(item, true));
  }

  passes.forEach(item => {
    const { id: rule, help: description, helpUrl, tags, nodes } = item;

    if (rule === 'frame-tested') return;

    const conformance = tags.filter(tag => tag.startsWith('wcag') || tag === 'best-practice');

    nodes.forEach(node => {
      const { html } = node;
      if (!(rule in passed.rules)) {
        passed.rules[rule] = { description, helpUrl, conformance, totalItems: 0, items: [] };
      }
      passed.rules[rule].items.push({ html });
      passed.totalItems += 1;
      passed.rules[rule].totalItems += 1;
      totalItems += 1;
    });
  });

  return {
    url,
    pageTitle,
    totalItems,
    mustFix,
    goodToFix,
    passed,
  };
};

export const runAxeScript = async (needsReview, includeScreenshots, page, randomToken, selectors = []) => {
  await crawlee.playwrightUtils.injectFile(page, axeScript);

  const results = await page.evaluate(
    async ({ selectors, saflyIconSelector, needsReview }) => {
      // remove so that axe does not scan
      document.querySelector(saflyIconSelector)?.remove();

      axe.configure({
        branding: {
          application: 'purple-hats',
        },
      });

      isReturnReviewItems = needsReview
        ? ['violations', 'passes', 'incomplete']
        : ['violations', 'passes'];

      return axe.run(selectors, {
        resultTypes: isReturnReviewItems,
      });
    },
    { selectors, saflyIconSelector },
  );

  if (includeScreenshots) {
    results.violations = await takeScreenshotForHTMLElements(results.violations, page, randomToken);
  if (needsReview) results.incomplete = await takeScreenshotForHTMLElements(results.incomplete, page, randomToken);
  }
  
  const pageTitle = await page.evaluate(() => document.title);
  return filterAxeResults(needsReview, results, pageTitle);
};

export const createCrawleeSubFolders = async randomToken => {
  const dataset = await crawlee.Dataset.open(randomToken);
  const requestQueue = await crawlee.RequestQueue.open(randomToken);
  return { dataset, requestQueue };
};

export const preNavigationHooks = [
  async (_crawlingContext, gotoOptions) => {
    gotoOptions = { waitUntil: 'networkidle', timeout: 30000 };
  },
];

export const postNavigationHooks = [
  async _crawlingContext => {
    guiInfoLog(guiInfoStatusTypes.COMPLETED);
  },
];

export const failedRequestHandler = async ({ request }) => {
  guiInfoLog(guiInfoStatusTypes.ERROR, { numScanned: 0, urlScanned: request.url });
  crawlee.log.error(`Failed Request - ${request.url}: ${request.errorMessages}`);
};

export const isUrlPdf = url => {
  return url.split('.').pop() === 'pdf';
};
