## Integrating Purple HATS with end-to-end testing frameworks
Purple HATS provides functionalities that makes it possible to be integrated with end-to-end testing frameworks such as [Cypress](https://www.cypress.io/) and [Playwright](https://playwright.dev/).

### Prerequisites
In order to use this functionality, the testing framework must support:
- Execution of scripts in a NodeJS environment.
- Injection of JavaScript into the document that is being tested.
- Execution of JavaScript in the context of the document and retrieval of results back into the NodeJS environment after execution.

### How to include Purple HATS in your project
1. Add Purple HATS to your project by running the following command:

    `npm install --save-dev @govtechsg/purple-hats`
2. In the file of choice, import Purple HATS using:
    
    `import purpleHatsInit from '@govtechsg/purple-hats'`

    Note that Purple HATS should be imported in a script that runs in a NodeJS environment.

3. Create an instance of Purple HATS with:

    `const ph = await purpleHatsInit(entryUrl)`

    `entryUrl` should be a valid URL referring to the domain of the website to be scanned with Purple HATS.

### How to use
Example usages for Cypress and Playwright can be found in [this section](#example-usages).

With reference to an instance of Purple HATS as `ph`:
1. Fetch the necessary scripts needed to be injected to document to be scanned by executing `ph.getScripts()`. The scripts will be returned as a string.
2. Inject the scripts into the document to be scanned. The easiest way that this can be done is by using `eval()` in the document's environment.
    - Note that this step needs to be done for every page visited.
3. Run a scan by executing `runA11yScan()` in the document's environment.
    - By default, the scan will be run for the entire page.
    - It is possible to run the scan for specific sections or elements in the page. One way to do this is to pass an array of CSS selectors of the elements to be scanned into `runA11yScan`. For example, `runA11yScan(['#my-component', 'button'])`. Other acceptable forms of argument can be found [here](https://github.com/dequelabs/axe-core/blob/develop/doc/API.md#context-parameter).
4. Pass the scan results back into the NodeJS environment where `ph` is in. 
5. Push the results using `await ph.pushScanResults(scanResults)`.
6. Repeat steps 2-5 as many times as desired.
7. Terminate Purple HATS by using `await ph.terminate()`. A folder containing the details and report of your scan will be created, under the directory `results` which can be found in your project's root directory.

### Example usages
#### Cypress
<details>
<summary>Click here to see an example usage in an E2E Cypress test</summary>

We will be creating the following files in a demo Cypress project:
    
    ├── cypress
    │   ├── e2e
    │   │   └── spec.cy.js
    │   └── support
    │       └── e2e.js
    ├── cypress.config.js
    └── package.json

Create a <code>package.json</code> by running <code>npm init</code> . Accept the default options or customise it as needed.

Change the type of npm package to module by running <code>npm pkg set type="module";</code>

Install the following node dependencies by running <code>npm install cypress @govtechsg/purple-hats --save-dev </code>

Navigate to <code>node_modules/@govtechsg/purple-hats</code> and run <code>npm install</code> within the folder to install remaining Purple HATS dependencies:

    cd node_modules/@govtechsg/purple-hats
    npm install
    cd ../../..

Create <code>cypress.config.js</code> with the following contents, and change your Name, E-mail address, and boolean value for whether rule items requiring manual review in the report should be displayed below:

    import { defineConfig } from "cypress";
    import purpleHatsInit from "@govtechsg/purple-hats";
    
    const ph = await purpleHatsInit(
        "https://govtechsg.github.io",
        "Demo Cypress Scan",
        "Your Name",
        "email@domain.com",
        false
    );
    
    export default defineConfig({
        e2e: {
            setupNodeEvents(on, config) {
                on("task", {
                    getPhScripts() {
                        return ph.getScripts();
                    },
                    async pushPhScanResults(res) {
                        await ph.pushScanResults(res);
                        return null;
                    },
                    returnResultsDir() {
                        return `results/${ph.randomToken}_${ph.scanDetails.urlsCrawled.scanned.length}pages/reports/report.html`;
                    },
                    async terminatePh() {
                        return await ph.terminate();
                    },
                });
            },
        },
    });

Create a sub-folder and file <code>cypress/support/e2e.js</code> with the following contents::
    
    Cypress.Commands.add("injectPhScripts", () => {
        cy.task("getPhScripts").then((s) => {
            cy.window().then((win) => {
                win.eval(s);
            });
        });
    });
    
    Cypress.Commands.add("runPhScan", (elements) => {
        cy.window().then(async (win) => {
            const res = await win.runA11yScan(elements);
            cy.task("pushPhScanResults", res);
        });
    });
    
    Cypress.Commands.add("terminatePh", () => {
        cy.task("terminatePh");
    });

Create <code>cypress/e2e/spec.cy.js</code> with the following contents:

    describe("template spec", () => {
        it("should run purple HATS", () => {
            cy.visit(
                "https://govtechsg.github.io/purple-banner-embeds/purple-integrated-scan-example.htm"
            );
            cy.injectPhScripts();
            cy.runPhScan();
            cy.contains("Click Me").click();
            // Run a scan on <input> and <button> elements
            cy.runPhScan(["input", "button"]);
    
            cy.terminatePh();
        });
    
    });

Run your test with <code>npx cypress run</code> .

You will see Purple HATS results generated in <code>results</code> folder.

</details>

#### Playwright

<details>
    <summary>Click here to see an example usage in Playwright</summary>

Create a <code>package.json</code> by running <code>npm init</code> . Accept the default options or customise it as needed.

Install the following node dependencies by running <code>npm install playwright @govtechsg/purple-hats --save-dev </code>

Navigate to <code>node_modules/@govtechsg/purple-hats</code> and run <code>npm install</code> within the folder to install remaining  Purple HATS dependencies.

On your project's root folder, create a Playwright test file <code>ph-playwright-demo.js</code>:

    import { chromium } from "playwright";
    import purpleHatsInit from "@govtechsg/purple-hats";
    
    const ph = await purpleHatsInit(
        "https://govtechsg.github.io",
        "Demo Playwright Scan",
        "Your Name",
        "email@domain.com"
    );
    
    (async () => {
        const browser = await chromium.launch({
            headless: false,
        });
        const context = await browser.newContext();
        const page = await context.newPage();
    
        const runPhScan = async (elementsToScan) => {
            const scanRes = await page.evaluate(
                async elementsToScan => await runA11yScan(elementsToScan),
                elementsToScan,
            );
            await ph.pushScanResults(scanRes);
        };
    
        await page.goto('https://govtechsg.github.io/purple-banner-embeds/purple-integrated-scan-example.htm');
        await page.evaluate(ph.getScripts());
        await runPhScan();
    
        await page.getByRole('button', { name: 'Click Me' }).click();
        // Run a scan on <input> and <button> elements
        await runPhScan(['input', 'button'])
    
        // ---------------------
        await context.close();
        await browser.close();
        await ph.terminate();
    })();

Run your test with <code>node ph-playwright-demo.js</code> .

You will see Purple HATS results generated in <code>results</code> folder.

</details>
