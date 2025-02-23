let isAdminMode = false;
let apiKey = localStorage.getItem('addon-market-api-key') || '';

// 初始化时检查密钥
function checkAdminStatus() {
    apiKey = localStorage.getItem('addon-market-api-key') || '';
    isAdminMode = !!apiKey;
    updateAdminUI();
}

// 更新管理员UI状态
function updateAdminUI() {
    const adminBtn = document.getElementById('adminToggle');
    if (!adminBtn) return;

    adminBtn.innerHTML = isAdminMode ? 
        `<i class="fas fa-shield"></i> 管理员模式已启用` :
        `<i class="fas fa-lock"></i> 开启管理员模式`;

    adminBtn.classList.toggle('btn-outline-success', isAdminMode);
    adminBtn.classList.toggle('btn-outline-secondary', !isAdminMode);
}
// 全局状态管理
let currentFilter = 'all'; // all | passed | pending
let allAddonsCache = null;

// 初始化入口
window.addEventListener('DOMContentLoaded', () => {
    checkAdminStatus();
    initApplication();
});

async function initApplication() {
    try {
        createFilterControls();
        setupEventListeners();
        await loadInitialData();
    } catch (error) {
        handleFatalError(error);
    }
}

// 创建筛选控件
function createFilterControls() {
    const container = document.querySelector('.container');
    container.insertAdjacentHTML('afterbegin', `
        <div class="row mb-4">
            <div class="col-md-8">
                <div class="btn-group" role="group">
                    <input type="radio" class="btn-check" name="filter" id="filter-all" checked>
                    <label class="btn btn-outline-primary" for="filter-all">全部</label>
                    
                    <input type="radio" class="btn-check" name="filter" id="filter-passed">
                    <label class="btn btn-outline-primary" for="filter-passed">已审核</label>
                    
                    <input type="radio" class="btn-check" name="filter" id="filter-pending">
                    <label class="btn btn-outline-primary" for="filter-pending">未审核</label>
                </div>
            </div>
        </div>
    `);
}

// 事件监听设置
function setupEventListeners() {
    // 筛选切换
    document.querySelectorAll('input[name="filter"]').forEach(radio => {
        radio.addEventListener('change', handleFilterChange);
    });

    // 下载按钮委托
    document.addEventListener('click', handleDownloadClick);
    document.getElementById('searchBtn').addEventListener('click', handleSearch);
    document.getElementById('searchType').addEventListener('change', function() {
        const searchInput = document.getElementById('searchId');
        if (this.value === 'id') {
            searchInput.type = 'number';
            searchInput.placeholder = '输入插件ID';
            searchInput.min = '1';
        } else {
            searchInput.type = 'text';
            searchInput.placeholder = '输入关键词';
            searchInput.removeAttribute('min');
        }
    });
    document.getElementById('adminToggle').addEventListener('click', () => {
    if (!isAdminMode) {
        new bootstrap.Modal('#adminModal').show();
    } else {
        // 退出管理员模式
        apiKey = '';
        localStorage.removeItem('addon-market-api-key');
        isAdminMode = false;
        updateAdminUI();
        applyCurrentFilter(); // 刷新列表
        showNotification('已退出管理员模式', 'info');
    }
    });
    document.getElementById('saveSecretKey').addEventListener('click', async () => {
        const key = document.getElementById('secretKeyInput').value.trim();
        if (!key) return;
    
        try {
            // 显示验证状态
            const saveBtn = document.getElementById('saveSecretKey');
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 验证中...';
            saveBtn.disabled = true;
    
            // 使用id=1的插件进行验证
            const response = await fetch(`https://api.youmu.ltd/pass/1`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': key
                }
            });
    
            const result = await response.json();
            
            if (result.id === 0) {
                // 验证成功
                apiKey = key;
                localStorage.setItem('addon-market-api-key', key);
                isAdminMode = true;
                updateAdminUI();
                bootstrap.Modal.getInstance('#adminModal').hide();
                applyCurrentFilter();
                showNotification('Secret Key验证成功', 'success');
            } else if (result.id === 100) {
                showNotification('无效的Secret Key', 'danger');
                document.getElementById('secretKeyInput').value = '';
            } else {
                showNotification('验证服务不可用，请稍后重试', 'warning');
            }
        } catch (error) {
            console.error('验证失败:', error);
            showNotification('验证过程中发生错误', 'danger');
        } finally {
            // 重置按钮状态
            const saveBtn = document.getElementById('saveSecretKey');
            saveBtn.innerHTML = '保存';
            saveBtn.disabled = false;
        }
    });

    // 手动刷新按钮
    document.getElementById('manualRefresh').addEventListener('click', async () => {
        showLoading();
        try {
            await loadInitialData();
        } catch (error) {
            showError('手动刷新失败，请重试');
            console.error('Manual refresh error:', error);
        } finally {
            hideLoading();
        }
    });

    // 提交新插件处理
    document.getElementById('submitAddon').addEventListener('click', async () => {
        const addonJsonInput = document.getElementById('addonJsonInput').value.trim();
        if (!addonJsonInput) {
            showNotification('请输入插件 JSON 内容', 'warning');
            return;
        }

        try {
            JSON.parse(addonJsonInput); // 验证 JSON 格式
        } catch (error) {
            showNotification('无效的 JSON 格式', 'danger');
            return;
        }

        try {
            const response = await fetch('https://api.youmu.ltd/new/addon', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({ string: addonJsonInput })
            });

            if (response.ok) {
                showNotification('插件提交成功', 'success');
                bootstrap.Modal.getInstance(document.getElementById('submitAddonModal')).hide();
                await applyCurrentFilter(); // 刷新列表
            } else {
                showNotification('插件提交失败', 'danger');
            }
        } catch (error) {
            console.error('插件提交失败:', error);
            showNotification('插件提交失败，请重试', 'danger');
        }
    });
}

// 初始数据加载
async function loadInitialData() {
    showLoading();
    try {
        const [allData] = await Promise.all([
            fetchAddons('all'),
            // 可在此添加其他预加载请求
        ]);
        allAddonsCache = allData;
        applyCurrentFilter();
    } catch (error) {
        showError('初始化加载失败，请刷新页面');
        throw error;
    } finally {
        hideLoading();
    }
}

// 筛选处理
async function handleFilterChange(e) {
    currentFilter = e.target.id.split('-')[1];
    showLoading();
    try {
        await applyCurrentFilter();
    } catch (error) {
        showError('筛选失败，请重试');
        console.error('Filter error:', error);
    } finally {
        hideLoading();
    }
}

// 应用当前筛选
async function applyCurrentFilter() {
    let data;
    if (currentFilter === 'all' && allAddonsCache) {
        data = allAddonsCache;
    } else {
        data = await fetchAddons(currentFilter);
    }
    renderAddons(data);
}

// 数据获取
async function fetchAddons(filterType) {
    let endpoint;
    switch(filterType) {
        case 'passed':
            endpoint = '/fetch/pass/1';
            break;
        case 'pending':
            endpoint = '/fetch/pass/0';
            break;
        default:
            endpoint = '/fetch/all';
    }

    try {
        const response = await fetch(`https://api.youmu.ltd${endpoint}?_=${Date.now()}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Fetch error:', error);
        throw new Error('无法获取插件数据');
    }
}

// 渲染插件列表
function renderAddons(addons) {
    const listContainer = document.getElementById('addons-list');
    listContainer.innerHTML = addons.map(addon => {
        const isPassed = addon.passed;
        const adminControls = isAdminMode ? `
        <div class="mt-2">
            ${isPassed ? 
            `<button class="btn btn-sm btn-danger reject-btn" data-id="${addon.id}">
                <i class="fas fa-xmark"></i> 取消通过
            </button>` : 
            `<button class="btn btn-sm btn-success approve-btn" data-id="${addon.id}">
                <i class="fas fa-square-check"></i> 通过审核
            </button>`
            }
        </div>
        ` : '';

        return `
        <div class="col">
            <div class="card addon-card h-100">
            <div class="card-body">
                <h5 class="card-title">${escapeHTML(addon.name)}</h5>
                <span class="badge ${isPassed ? 'bg-success' : 'bg-warning'}">
                ${isPassed ? '已审核' : '待审核'}
                </span>
                <p class="card-text mt-2">${escapeHTML(addon.description)}</p>
                <small class="text-muted">插件ID: ${addon.id}</small>
                ${(isPassed || isAdminMode) ? `
                <div class="mt-3">
                    <button class="btn btn-sm btn-primary download-btn" 
                    data-content="${encodeURIComponent(addon.content)}"
                    data-filename="${encodeURIComponent(addon.name)}">
                    <i class="fas fa-download"></i>下载配置
                    </button>
                </div>
                ` : ''}
                ${adminControls}
                <div class="mt-3">
                    <button class="btn btn-sm btn-info view-addon-btn" data-id="${addon.id}">
                        <i class="fas fa-circle-info"></i>查看详情
                    </button>
                </div>
            </div>
            </div>
        </div>
        `;
    }).join('');

    // 绑定新按钮事件
    document.querySelectorAll('.approve-btn').forEach(btn => {
        btn.addEventListener('click', () => handleApprove(btn.dataset.id));
    });
    document.querySelectorAll('.reject-btn').forEach(btn => {
        btn.addEventListener('click', () => handleReject(btn.dataset.id));
    });
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => handleDelete(btn.dataset.id));
    });
    document.querySelectorAll('.modify-btn').forEach(btn => {
        btn.addEventListener('click', () => handleModify(btn.dataset.id));
    });
    document.querySelectorAll('.view-addon-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = parseInt(btn.dataset.id);
            // 从缓存中查找插件
            const addon = allAddonsCache?.find(a => a.id === id);
            
            if (addon) {
                showSingleAddon(addon);
            } else {
                try {
                    // 如果缓存中没有，则从API获取
                    const response = await fetch(`https://api.youmu.ltd/fetch/${id}`);
                    if (response.ok) {
                        const data = await response.json();
                        showSingleAddon(data);
                    } else {
                        showNotification('插件不存在或已删除', 'warning');
                    }
                } catch (error) {
                    showNotification('获取插件详情失败', 'danger');
                }
            }
        });
    });
}

// 下载处理
async function handleDownloadClick(e) {
    const btn = e.target.closest('.download-btn');
    if (!btn) return;

    try {
        const rawContent = decodeURIComponent(btn.dataset.content);
        const fileName = decodeURIComponent(btn.dataset.filename);
        
        const content = rawContent
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t');

        const parsed = JSON.parse(content);
        downloadJSON(JSON.stringify(parsed, null, 2), fileName);
    } catch (error) {
        console.error('Download error:', error);
        alert('下载失败：配置文件格式异常');
    }
}

// 工具函数
function downloadJSON(content, fileName) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function escapeHTML(str) {
    return str.replace(/[&<>"']/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[tag] || tag));
}

function parseEscapedJSON(str) {
    try {
        const cleaned = str
            .replace(/\\"/g, '"')   // 替换转义双引号
            .replace(/\\n/g, '\n')  // 替换换行符
            .replace(/\\t/g, '\t')  // 替换制表符
            .replace(/\\\\/g, '\\');// 替换转义反斜杠
        
        return JSON.parse(cleaned);
    } catch (e) {
        console.error('JSON解析失败:', e);
        return { error: "Invalid JSON format" };
    }
}

function showLoading() {
    document.getElementById('loading').style.display = 'block';
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

function showError(message) {
    const container = document.getElementById('addons-list');
    container.innerHTML = `
        <div class="col-12">
            <div class="alert alert-danger">${message}</div>
        </div>
    `;
}

function handleFatalError(error) {
    document.body.innerHTML = `
        <div class="container mt-5">
            <div class="alert alert-danger">
                <h4>致命错误</h4>
                <p>${error.message}</p>
                <button class="btn btn-secondary" onclick="location.reload()">重新加载</button>
            </div>
        </div>
    `;
}
async function handleIdSearch() {
const idInput = document.getElementById('searchId');
const id = idInput.value.trim();

if (!id) {
alert('请输入有效的插件ID');
return;
}

showLoading();
try {
const response = await fetch(`https://api.youmu.ltd/fetch/${id}`);
if (response.status === 404) {
    throw new Error('未找到该插件');
}
const addon = await response.json();
showSingleAddon(addon);
} catch (error) {
showError("发生了错误！请检查输入的id是否存在。也可能是服务器发生故障。");
} finally {
hideLoading();
}
}

// 新增显示单个插件的模态框
// 新增显示单个插件的模态框
function showSingleAddon(addon) {
    const isPassed = addon.passed;
    
    // 创建模态框HTML
    const modalHtml = `
    <div class="modal fade" id="addonModal" tabindex="-1">
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">${escapeHTML(addon.name)}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="row">
                        <div class="col-md-6">
                            <p><strong>描述：</strong>${escapeHTML(addon.description)}</p>
                            <p><strong>状态：</strong>
                                <span class="badge ${isPassed ? 'bg-success' : 'bg-warning'}">
                                    ${isPassed ? '已审核' : '待审核'}
                                </span>
                            </p>
                            <p><strong>插件ID：</strong>${addon.id}</p>
                        </div>
                        <div class="col-md-6">
                            <div class="card">
                                <div class="card-header">配置信息</div>
                                <div class="card-body bg-light">
                                    ${(isAdminMode || isPassed) ? 
                                        `<pre>${escapeHTML(JSON.stringify(parseEscapedJSON(addon.content), null, 2))}</pre>` :
                                        `<div class="alert alert-warning m-0">
                                            <i class="fas fa-shield"></i>
                                            该插件尚未通过安全审核，无法查看配置详情
                                        </div>`
                                    }
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    ${isAdminMode ? `
                    <div class="btn-group me-auto">
                        ${addon.passed ? 
                            `<button type="button" class="btn btn-danger reject-btn" data-id="${addon.id}">
                                <i class="fas fa-ban"></i> 取消审核
                            </button>` : 
                            `<button type="button" class="btn btn-success approve-btn" data-id="${addon.id}">
                                <i class="fas fa-circle-check"></i> 通过审核
                            </button>`
                        }
                    </div>
                    ` : ''}
                    
                    ${(isAdminMode || isPassed) ? `
                    <button class="btn btn-primary download-btn" 
                        data-content="${encodeURIComponent(addon.content)}"
                        data-filename="${encodeURIComponent(addon.name)}">
                        <i class="fas fa-download"></i> 下载
                    </button>
                    ` : ''}
                    
                    ${isAdminMode ? `
                    <button type="button" class="btn btn-danger delete-btn" data-id="${addon.id}">
                        <i class="fas fa-trash"></i> 删除
                    </button>
                    <button type="button" class="btn btn-warning modify-btn" data-id="${addon.id}">
                        <i class="fas fa-pencil-square"></i> 修改
                    </button>
                    ` : ''}
                    
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"><i class="fas fa-xmark"></i>关闭</button>
                </div>
            </div>
        </div>
    </div>`;

    // 插入到DOM
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // 初始化并显示模态框
    const modalElement = document.getElementById('addonModal');
    const modal = new bootstrap.Modal(modalElement);
    modal.show();

    // 清理逻辑
    modalElement.addEventListener('hidden.bs.modal', () => {
        modal.dispose();
        modalElement.remove();
    });

    // 绑定事件
    modalElement.querySelector('.download-btn')?.addEventListener('click', handleDownloadClick);
    modalElement.querySelector('.delete-btn')?.addEventListener('click', () => handleDelete(addon.id));
    modalElement.querySelector('.modify-btn')?.addEventListener('click', () => handleModify(addon.id));
    modalElement.querySelector('.approve-btn')?.addEventListener('click', () => handleApprove(addon.id));
    modalElement.querySelector('.reject-btn')?.addEventListener('click', () => handleReject(addon.id));
}
// 审核通过处理
async function handleApprove(id) {
try {
    const response = await fetch(`https://api.youmu.ltd/pass/${id}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
        }
    });
    const result = await response.json();
    if (result.id === 0) {
        showNotification('审核通过成功', 'success');
        await applyCurrentFilter(); // 刷新列表
    } else if (result.id === 100) {
        showNotification('鉴权失败，请检查API Key', 'warning');
    } else if (result.id === 201) {
        showNotification('未找到相应Addon', 'warning');
    } else {
        showNotification('未知错误', 'danger');
    }
} catch (error) {
    console.error('审核通过失败:', error);
    showNotification('审核通过失败，请重试', 'danger');
}
}

// 取消审核通过处理
async function handleReject(id) {
try {
    const response = await fetch(`https://api.youmu.ltd/reject/${id}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
        }
    });
    const result = await response.json();
    if (result.id === 0) {
        showNotification('取消审核通过成功', 'success');
        await applyCurrentFilter(); // 刷新列表
    } else if (result.id === 100) {
        showNotification('鉴权失败，请检查API Key', 'warning');
    } else if (result.id === 201) {
        showNotification('未找到相应Addon', 'warning');
    } else {
        showNotification('未知错误', 'danger');
    }
} catch (error) {
    console.error('取消审核通过失败:', error);
    showNotification('取消审核通过失败，请重试', 'danger');
}
}

// 删除插件处理
async function handleDelete(id) {
if (!confirm('确定要删除这个插件吗？此操作无法撤销。')) {
    return;
}

try {
    const response = await fetch(`https://api.youmu.ltd/delete/${id}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
        }
    });
    const result = await response.json();
    if (result.id === 0) {
        showNotification('插件删除成功', 'success');
        await applyCurrentFilter(); // 刷新列表
    } else if (result.id === 100) {
        showNotification('鉴权失败，请检查API Key', 'warning');
    } else if (result.id === 201) {
        showNotification('未找到相应Addon', 'warning');
    } else {
        showNotification('未知错误', 'danger');
    }
} catch (error) {
    console.error('插件删除失败:', error);
    showNotification('插件删除失败，请重试', 'danger');
}
}

// 修改插件处理
async function handleModify(id) {
const newContent = prompt('请输入新的插件 JSON 内容:');
if (!newContent) {
    showNotification('插件 JSON 内容不能为空', 'warning');
    return;
}

try {
    JSON.parse(newContent); // 验证 JSON 格式
} catch (error) {
    showNotification('无效的 JSON 格式', 'danger');
    return;
}

try {
    const response = await fetch(`https://api.youmu.ltd/modify/${id}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-API-Key': apiKey
        },
        body: new URLSearchParams({ string: newContent })
    });

    if (response.ok) {
        showNotification('插件修改成功', 'success');
        await applyCurrentFilter(); // 刷新列表
    } else {
        showNotification('插件修改失败', 'danger');
    }
} catch (error) {
    console.error('插件修改失败:', error);
    showNotification('插件修改失败，请重试', 'danger');
}
}

// 显示通知
function showNotification(message, type = 'info') {
const toastEl = document.getElementById('notificationToast');
const toastBody = toastEl.querySelector('.toast-body');
toastBody.textContent = message;

toastEl.classList.remove('bg-info', 'bg-success', 'bg-danger', 'bg-warning');
toastEl.classList.add(`bg-${type}`);

const toast = new bootstrap.Toast(toastEl);
toast.show();
}

async function handleSearch() {
    const searchType = document.getElementById('searchType').value;
    const searchValue = document.getElementById('searchId').value.trim();

    showLoading();
    try {
        // 当搜索内容为空时显示全部插件
        if (!searchValue) {
            currentFilter = 'all';
            await applyCurrentFilter();
            return;
        }

        if (searchType === 'id') {
            await handleIdSearch();
        } else {
            await handleKeywordSearch(searchValue);
        }
    } finally {
        hideLoading();
    }
}
// 新增模糊搜索处理
async function handleKeywordSearch(keyword) {
    if (!allAddonsCache) {
        await loadInitialData();
    }
    
    const searchTerm = keyword.toLowerCase();
    const results = allAddonsCache.filter(addon => {
        return addon.name.toLowerCase().includes(searchTerm) || 
               addon.description.toLowerCase().includes(searchTerm);
    });

    if (results.length === 0) {
        showNotification('未找到匹配的插件', 'warning');
        return;
    }

    renderAddons(results, searchTerm); // 传入搜索关键词用于高亮
}

