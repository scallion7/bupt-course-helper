// ==UserScript==
// @name         北邮研究生后台选课脚本
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  根据课程编号自动抢课，可靠处理 iframe 弹窗，每次刷新只尝试一次。
// @match        *://*/xsxk/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // === 配置：要抢的课程编号 ===
    const targetCourseIds = ["3131101546"];

    // 页面刷新间隔（毫秒），例如：10秒刷新一次
    const refreshInterval = 1.5 * 1000;

    /**
     * 等待指定元素出现在指定的文档或子文档中 (MutationObserver 方案)
     * @param {Document} doc - 要进行搜索的文档对象 (可以是主文档 document 或 iframe.contentDocument)
     * @param {string} selector - 要查找的元素的CSS选择器
     * @param {number} timeout - 超时时间（毫秒）
     * @returns {Promise<Element|null>} - 返回找到的元素或在超时后返回 null
     */
    function waitForElement(doc, selector, timeout = 1000) {
        return new Promise((resolve) => {
            // 首先检查元素是否已经存在
            const existingElement = doc.querySelector(selector);
            if (existingElement && existingElement.offsetParent !== null) {
                resolve(existingElement);
                return;
            }

            const observer = new MutationObserver((mutations, obs) => {
                const targetElement = doc.querySelector(selector);
                // 确保元素不仅存在，而且是可见的
                if (targetElement && targetElement.offsetParent !== null) {
                    obs.disconnect(); // 找到后立即停止观察
                    resolve(targetElement);
                }
            });

            // 启动观察器，监视指定文档的 body 及其所有后代节点的变化
            observer.observe(doc.body, {
                childList: true,
                subtree: true
            });

            // 设置超时，以防元素一直不出现
            setTimeout(() => {
                observer.disconnect();
                // 在超时后最后再检查一次
                resolve(doc.querySelector(selector));
            }, timeout);
        });
    }

    /**
     * 在指定的文档中等待并点击目标按钮
     * @param {Document} doc - 要进行搜索的文档对象
     * @param {string} textContent - 按钮的文本
     * @returns {Promise<boolean>} - 返回是否成功点击
     */
    async function findAndClickButton(doc, textContent) {
        console.log(`正在等待文本为 "${textContent}" 的按钮出现...`);
        const selector = "span.l-btn-text";
        // 等待所有匹配选择器的元素出现
        await waitForElement(doc, selector);

        const buttons = [...doc.querySelectorAll(selector)];
        const targetButton = buttons.find(el => el.textContent.trim() === textContent && el.offsetParent !== null);

        if (targetButton) {
            console.log(`成功找到 "${textContent}" 按钮，正在点击...`);
            targetButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
            return true;
        } else {
            console.log(`未找到或超时，"${textContent}" 按钮不存在或不可见。`);
            return false;
        }
    }


    // 使用 async 关键字，因为内部需要使用 await
    async function 抢课() {
        console.log("页面加载完成，开始执行单次抢课检测...");
        const rows = document.querySelectorAll("tr");

        for (const row of rows) {
            const cells = row.querySelectorAll("td");
            if (cells.length < 9) continue;

            const courseId = cells[0].innerText.trim();
            const status = cells[8].innerText.trim();
            const actionCell = cells[7];

            if (targetCourseIds.includes(courseId) && status.includes("正在选课")) {
                console.log(`发现目标课程 ${courseId} 可选，状态: ${status}`);
                const btn = actionCell.querySelector("a, span, div");

                if (btn) {
                    console.log(`点击课程 ${courseId} 的选择班级按钮`);
                    btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

                    // --- 核心修改：处理 iframe ---

                    // 1. 等待 iframe 弹窗出现在主文档中
                    // 注意：如果页面上有多个iframe，你可能需要一个更精确的选择器，例如 'iframe[id^="dialog"]'
                    console.log("正在等待 iframe 弹窗出现...");
                    const iframe = await waitForElement(document, 'iframe');

                    if (!iframe) {
                        console.error("超时：未能找到 iframe 弹窗。");
                        continue; // 继续检查下一门课
                    }
                    console.log("成功找到 iframe 弹窗。");

                    // 2. 等待 iframe 加载完成并获取其内部的 document 对象
                    // 我们通过等待 iframe 内部的一个稳定元素（如body）来确保其加载完成
                    await waitForElement(iframe.contentDocument, 'body');
                    const iframeDoc = iframe.contentDocument;

                    if (!iframeDoc) {
                        console.error("无法访问 iframe 的内部文档，可能是跨域或加载失败。");
                        continue;
                    }
                    console.log("成功访问 iframe 内部文档。");

                    // 3. 在 iframe 内部文档中查找并点击 "选" 按钮
                    const success = await findAndClickButton(iframeDoc, "选");

                    if (success) {
                        console.log(`课程 ${courseId} 的 "选" 按钮已点击！`);
                        // 任务完成，可以停止后续操作并等待刷新
                        clearInterval(refreshTimer); // 停止自动刷新，因为操作可能成功了
                        return; // 退出整个抢课函数
                    }
                }
            }
        }
    }

    // 页面加载后执行抢课函数
    抢课();

    // 定时刷新页面
    const refreshTimer = setInterval(() => {
        console.log(`本次尝试结束。等待 ${refreshInterval / 1000} 秒后，刷新页面获取最新课程状态...`);
        location.reload();
    }, refreshInterval);

})();
