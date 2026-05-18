lucide.createIcons();
let workspaces = {
    "Workspace 1": { nodes: [], connections: [], history: [] }
};
let activeWorkspace = "Workspace 1";
let nodes = [];
let connections = [];
let zoom = 1;
let panX = 0, panY = 0;
let selectedNodes = [];
let selectedLines = [];
let history = [];
let isPanning = false;
let isLinking = false;
let linkSource = null;
let isCodeVisible = false;
let activeEditingLine = null;
let isMarqueeSelecting = false;
let marqueeStartCoords = { x: 0, y: 0 };
let nodeClipboardRegistryMatrix = [];
let globalLastSpawnedNodeReferencePointer = null;
let isExecutionHalted = false;
function stopLogic() {
    isExecutionHalted = true;
}
let activeLineHandle = null;
let activeLineEndpointHandle = null;
let redoStack = []; 
function saveState() {
    if (history.length > 50) history.shift();
    history.push({
        nodes: JSON.parse(JSON.stringify(nodes)),
        connections: JSON.parse(JSON.stringify(connections))
    });
    redoStack = []; 
    workspaces[activeWorkspace].nodes = JSON.parse(JSON.stringify(nodes));
    workspaces[activeWorkspace].connections = JSON.parse(JSON.stringify(connections));
    workspaces[activeWorkspace].history = JSON.parse(JSON.stringify(history));
    autoSaveCache(); 
}
function undo() {
    if (history.length === 0) return;
    redoStack.push({
        nodes: JSON.parse(JSON.stringify(nodes)),
        connections: JSON.parse(JSON.stringify(connections))
    });
    const lastState = history.pop();
    nodes = lastState.nodes;
    connections = lastState.connections;
    refreshWorkspaceView();
}
function redo() {
    if (redoStack.length === 0) return;
    history.push({
        nodes: JSON.parse(JSON.stringify(nodes)),
        connections: JSON.parse(JSON.stringify(connections))
    });
    const nextState = redoStack.pop();
    nodes = nextState.nodes;
    connections = nextState.connections;
    refreshWorkspaceView();
}
function refreshWorkspaceView() {
    document.querySelectorAll('.node').forEach(el => el.remove());
    nodes.forEach(n => renderNode(n, true));
    drawAllConnections();
    clearSelection();
    closeEditor();
}
function autoSaveCache() {
    const dataBundle = {
        workspaces: workspaces,
        activeWorkspace: activeWorkspace,
        darkThemeEnabled: document.body.classList.contains('dark-mode')
    };
    localStorage.setItem('flowchart_core_persistent_cache', JSON.stringify(dataBundle));
}
function loadPersistedCacheOnBoot() {
    const engineCache = localStorage.getItem('flowchart_core_persistent_cache');
    if (!engineCache) return;
    try {
        const parsedCache = JSON.parse(engineCache);
        if (parsedCache.workspaces) {
            workspaces = parsedCache.workspaces;
            activeWorkspace = parsedCache.activeWorkspace || "Workspace 1";
            if (parsedCache.darkThemeEnabled) {
                document.body.classList.add('dark-mode');
            }
            updateWorkspaceTabsUI();
            loadWorkspaceState(activeWorkspace);
        }
    } catch (e) { console.error("Cache boot corruption skipped safely", e); }
}
function toggleSystemTheme() {
    document.body.classList.toggle('dark-mode');
    autoSaveCache();
}
function handleMultiExport(format) {
    if (format === 'pdf') {
        exportToPDF();
    } else if (['png', 'jpeg', 'jpg'].includes(format)) {
        exportToImageStream(format);
    }
}
function exportToImageStream(format) {
    if (nodes.length === 0) {
        callPremiumModalAlert("No structural elements detected to export.", "නිකුත් කිරීමේ දෝෂයක්", "red");
        return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
        if (n.x < minX) minX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.x + 180 > maxX) maxX = n.x + 180;
        if (n.y + 120 > maxY) maxY = n.y + 120;
    });
    minX = Math.max(0, minX - 40);
    minY = Math.max(0, minY - 40);
    let frameWidth = (maxX - minX) + 80;
    let frameHeight = (maxY - minY) + 80;
    html2canvas(canvas, {
        scale: 2, 
        useCORS: true,
        backgroundColor: document.body.classList.contains('dark-mode') ? "#0f172a" : "#f8fafc",
        x: minX,
        y: minY,
        width: frameWidth,
        height: frameHeight
    }).then(renderCanvas => {
        const targetType = format === 'jpg' ? 'image/jpeg' : `image/${format}`;
        const dataUriStream = renderCanvas.toDataURL(targetType);
        const downloadAnchor = document.createElement('a');
        downloadAnchor.href = dataUriStream;
        downloadAnchor.download = `Flowchart_Layout_${Date.now()}.${format}`;
        downloadAnchor.click();
        callPremiumModalAlert(`ඔබගේ Flowchart සටහන සාර්ථකව ${format.toUpperCase()} රූප රාමුවක් ලෙස නිකුත් කරන ලදී.`, "අපනයනය සාර්ථකයි", "green");
    });
}
const canvas = document.getElementById('canvas');
const container = document.getElementById('canvas-container');
const svg = document.getElementById('svg-connections');
const marqueeDiv = document.createElement('div');
marqueeDiv.id = 'marquee-selector';
marqueeDiv.style.position = 'absolute';
marqueeDiv.style.border = '1px dashed #2563eb';
marqueeDiv.style.backgroundColor = 'rgba(37, 99, 235, 0.09)';
marqueeDiv.style.pointerEvents = 'none';
marqueeDiv.style.display = 'none';
marqueeDiv.style.zIndex = '999';
canvas.appendChild(marqueeDiv);
updateWorkspaceTabsUI();
updateTransform();
function toggleGuideline(show) {
    document.getElementById('guideline-panel').classList.toggle('hidden', !show);
}
function callPremiumModalAlert(message, title = "System Notification", theme = "blue", type = "alert") {
    return new Promise((resolve) => {
        const modal = document.getElementById('premium-alert-modal');
        const box = modal.querySelector('div');
        const titleEl = document.getElementById('premium-alert-title');
        const msgEl = document.getElementById('premium-alert-message');
        const cancelBtn = document.getElementById('premium-alert-cancel');
        const submitBtn = document.getElementById('premium-alert-submit');
        const iconContainer = document.getElementById('premium-alert-icon-container');
        const iconEl = document.getElementById('premium-alert-icon');
        titleEl.innerText = title;
        msgEl.innerText = message;
        if (theme === "red") {
            iconContainer.className = "w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-600 shadow-sm";
            iconEl.setAttribute('data-lucide', 'alert-triangle');
            submitBtn.className = "px-5 py-2 text-xs font-bold bg-red-600 text-white rounded-xl shadow-md hover:bg-red-700 transition-all uppercase tracking-wider";
        } else if (theme === "green") {
            iconContainer.className = "w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shadow-sm";
            iconEl.setAttribute('data-lucide', 'check-circle');
            submitBtn.className = "px-5 py-2 text-xs font-bold bg-emerald-600 text-white rounded-xl shadow-md hover:bg-emerald-700 transition-all uppercase tracking-wider";
        } else {
            iconContainer.className = "w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shadow-sm";
            iconEl.setAttribute('data-lucide', 'info');
            submitBtn.className = "px-5 py-2 text-xs font-bold bg-blue-600 text-white rounded-xl shadow-md hover:bg-blue-700 transition-all uppercase tracking-wider";
        }
        lucide.createIcons();
        if (type === "confirm") {
            cancelBtn.classList.remove('hidden');
        } else {
            cancelBtn.classList.add('hidden');
        }
        modal.classList.remove('hidden');
        setTimeout(() => {
            box.classList.remove('scale-95', 'opacity-0');
            box.classList.add('scale-100', 'opacity-100');
        }, 10);
        const closeWithResult = (result) => {
            box.classList.remove('scale-100', 'opacity-100');
            box.classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                modal.classList.add('hidden');
                resolve(result);
            }, 150);
        };
        submitBtn.onclick = () => closeWithResult(true);
        cancelBtn.onclick = () => closeWithResult(false);
    });
}
function togglePython() {
    isCodeVisible = !isCodeVisible;
    const pyOut = document.getElementById('python-output');
    pyOut.classList.toggle('hidden', !isCodeVisible);
    if (isCodeVisible) generateSystemCodeView();
}
function zoomIn() { zoom = Math.min(2, zoom + 0.1); updateZoomUI(); }
function zoomOut() { zoom = Math.max(0.4, zoom - 0.1); updateZoomUI(); }
function resetZoom() { zoom = 1; panX = 0; panY = 0; updateZoomUI(); }
function updateZoomUI() {
    document.getElementById('zoom-level').innerText = `${Math.round(zoom * 100)}%`;
    updateTransform();
}
container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const scaleAmount = -e.deltaY * 0.001;
    zoom = Math.min(Math.max(0.4, zoom + scaleAmount), 2);
    updateZoomUI();
});
function getEventCoords(e) {
    if (e.touches && e.touches.length > 0) {
        return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
    }
    return { clientX: e.clientX, clientY: e.clientY };
}
function handlePointerStart(e) {
    const target = e.target;
    if (e.shiftKey && (target === container || target === canvas || target === svg)) {
        isMarqueeSelecting = true;
        const rect = canvas.getBoundingClientRect();
        marqueeStartCoords = {
            x: (e.clientX - rect.left) / zoom,
            y: (e.clientY - rect.top) / zoom
        };
        marqueeDiv.style.left = `${marqueeStartCoords.x}px`;
        marqueeDiv.style.top = `${marqueeStartCoords.y}px`;
        marqueeDiv.style.width = '0px';
        marqueeDiv.style.height = '0px';
        marqueeDiv.style.display = 'block';
        return;
    }
    if (e.button === 1 || target === container || target === canvas || target === svg) {
        isPanning = true;
        container.style.cursor = 'grabbing';
    }
}
function performCoreClipboardCopySystem() {
    if (selectedNodes.length === 0) return;
    nodeClipboardRegistryMatrix = selectedNodes.map(sid => {
        const targetNodeObj = nodes.find(n => n.id === sid);
        return Object.assign({}, targetNodeObj);
    });
}
function performCoreClipboardPasteSystem() {
    if (nodeClipboardRegistryMatrix.length === 0) return;
    saveState();
    clearSelection();
    let mappingIdTranslationArray = {};
    let spatialCloningOffsetStep = 40;
    nodeClipboardRegistryMatrix.forEach(originalNode => {
        const uniqueGeneratedNodeId = 'node_' + Date.now() + Math.floor(Math.random() * 1000);
        mappingIdTranslationArray[originalNode.id] = uniqueGeneratedNodeId;
        const clonedNodeInstance = {
            id: uniqueGeneratedNodeId,
            type: originalNode.type,
            x: originalNode.x + spatialCloningOffsetStep,
            y: originalNode.y + spatialCloningOffsetStep,
            text: originalNode.text,
            bgColor: originalNode.bgColor,
            borderColor: originalNode.borderColor
        };
        nodes.push(clonedNodeInstance);
        renderNode(clonedNodeInstance);
        selectedNodes.push(uniqueGeneratedNodeId);
        document.getElementById(uniqueGeneratedNodeId).classList.add('selected');
        globalLastSpawnedNodeReferencePointer = clonedNodeInstance;
    });
    drawAllConnections();
    if (isCodeVisible) generateSystemCodeView();
}
function performCoreClipboardDuplicateSystem() {
    if (selectedNodes.length === 0) return;
    performCoreClipboardCopySystem();
    performCoreClipboardPasteSystem();
}
function handlePointerMove(e) {
    const coords = getEventCoords(e);
    if (isMarqueeSelecting) {
        const rect = canvas.getBoundingClientRect();
        const currentMouseX = (e.clientX - rect.left) / zoom;
        const currentMouseY = (e.clientY - rect.top) / zoom;
        const areaBoxLeft = Math.min(marqueeStartCoords.x, currentMouseX);
        const areaBoxTop = Math.min(marqueeStartCoords.y, currentMouseY);
        const areaBoxWidth = Math.abs(marqueeStartCoords.x - currentMouseX);
        const areaBoxHeight = Math.abs(marqueeStartCoords.y - currentMouseY);
        marqueeDiv.style.left = `${areaBoxLeft}px`;
        marqueeDiv.style.top = `${areaBoxTop}px`;
        marqueeDiv.style.width = `${areaBoxWidth}px`;
        marqueeDiv.style.height = `${areaBoxHeight}px`;
        return;
    }
    if (isPanning) {
        if (e.movementX !== undefined) {
            panX += e.movementX;
            panY += e.movementY;
        } else if (this.lastX !== undefined) {
            panX += coords.clientX - this.lastX;
            panY += coords.clientY - this.lastY;
        }
        this.lastX = coords.clientX;
        this.lastY = coords.clientY;
        updateTransform();
        return;
    }
    this.lastX = coords.clientX;
    this.lastY = coords.clientY;
    if (activeLineHandle) {
        const rect = canvas.getBoundingClientRect();
        const currentMouseX = (coords.clientX - rect.left) / zoom;
        const currentMouseY = (coords.clientY - rect.top) / zoom;
        if (activeLineHandle.type === 'H') {
            activeLineHandle.conn.customOffsetX = Math.round((currentMouseX - activeLineHandle.baseX) / 20) * 20;
        } else {
            activeLineHandle.conn.customOffsetY = Math.round((currentMouseY - activeLineHandle.baseY) / 20) * 20;
        }
        drawAllConnections();
    } else if (activeLineEndpointHandle) {
        const rect = canvas.getBoundingClientRect();
        activeLineEndpointHandle.currentX = (coords.clientX - rect.left) / zoom;
        activeLineEndpointHandle.currentY = (coords.clientY - rect.top) / zoom;
        drawAllConnections();
    }
}
function handlePointerEnd(e) {
    if (isMarqueeSelecting) {
        isMarqueeSelecting = false;
        marqueeDiv.style.display = 'none';
        const areaBoxLeft = parseFloat(marqueeDiv.style.left);
        const areaBoxTop = parseFloat(marqueeDiv.style.top);
        const areaBoxWidth = parseFloat(marqueeDiv.style.width);
        const areaBoxHeight = parseFloat(marqueeDiv.style.height);
        if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
            clearSelection();
        }
        nodes.forEach(n => {
            const domEl = document.getElementById(n.id);
            const shapeWidth = 160;
            const shapeHeight = domEl ? domEl.offsetHeight : 60;
            if (n.x >= areaBoxLeft && (n.x + shapeWidth) <= (areaBoxLeft + areaBoxWidth) &&
                n.y >= areaBoxTop && (n.y + shapeHeight) <= (areaBoxTop + areaBoxHeight)) {
                if (!selectedNodes.includes(n.id)) {
                    selectedNodes.push(n.id);
                    if (domEl) domEl.classList.add('selected');
                }
            }
        });
        drawAllConnections();
        return;
    }
    isPanning = false;
    container.style.cursor = 'grab';
    this.lastX = undefined;
    this.lastY = undefined;
    if (activeLineHandle) {
        saveState();
        activeLineHandle = null;
    }
    if (activeLineEndpointHandle) {
        const touchX = activeLineEndpointHandle.currentX * zoom + canvas.getBoundingClientRect().left;
        const touchY = activeLineEndpointHandle.currentY * zoom + canvas.getBoundingClientRect().top;
        const elements = document.elementsFromPoint(touchX, touchY);
        const targetPortEl = elements.find(el => el.classList.contains('port'));
        const targetNodeEl = elements.find(el => el.classList.contains('node'));
        if (targetNodeEl) {
            saveState();
            let targetPort = 'top';
            if (targetPortEl) {
                targetPort = targetPortEl.className.split(' ').find(c => c.startsWith('port-')).split('-')[1];
            } else {
                const rect = targetNodeEl.getBoundingClientRect();
                const dTop = Math.abs(touchY - rect.top);
                const dBottom = Math.abs(touchY - rect.bottom);
                const dLeft = Math.abs(touchX - rect.left);
                const dRight = Math.abs(touchX - rect.right);
                const minDist = Math.min(dTop, dBottom, dLeft, dRight);
                if (minDist === dTop) targetPort = 'top';
                else if (minDist === dBottom) targetPort = 'bottom';
                else if (minDist === dLeft) targetPort = 'left';
                else if (minDist === dRight) targetPort = 'right';
            }
            if (activeLineEndpointHandle.role === 'from') {
                if (targetNodeEl.id !== activeLineEndpointHandle.conn.to) {
                    activeLineEndpointHandle.conn.from = targetNodeEl.id;
                    activeLineEndpointHandle.conn.fromPort = targetPort;
                }
            } else {
                if (targetNodeEl.id !== activeLineEndpointHandle.conn.from) {
                    activeLineEndpointHandle.conn.to = targetNodeEl.id;
                    activeLineEndpointHandle.conn.toPort = targetPort;
                }
            }
        }
        activeLineEndpointHandle = null;
        saveState();
        drawAllConnections();
    }
}
let initialTouchDistance = null;
let initialZoom = 1;
function getTouchDistance(e) {
    if (e.touches.length < 2) return 0;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}
container.addEventListener('mousedown', handlePointerStart);
window.addEventListener('mousemove', handlePointerMove);
window.addEventListener('mouseup', handlePointerEnd);
container.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        isPanning = false; 
        initialTouchDistance = getTouchDistance(e);
        initialZoom = zoom;
        e.preventDefault();
    } else {
        if (e.target.classList.contains('port') || isLinking) {
            isPanning = false; 
        } else {
            handlePointerStart(e);
        }
    }
}, { passive: false });
window.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && initialTouchDistance) {
        e.preventDefault();
        const currentDist = getTouchDistance(e);
        if (currentDist > 5) {
            const factor = currentDist / initialTouchDistance;
            zoom = Math.min(Math.max(0.4, initialZoom * factor), 2);
            updateZoomUI();
        }
        return;
    }
    if (isLinking || isPanning) {
        e.preventDefault();
    }
    handlePointerMove(e);
}, { passive: false });
window.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
        initialTouchDistance = null;
    }
    handlePointerEnd(e);
});
function updateTransform() {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
}
function addNode(type) {
    saveState();
    const id = 'node_' + Date.now();
    let nType = type;
    let text = 'New ' + type;
    if (type === 'start') { nType = 'terminal'; text = 'START'; }
    if (type === 'end') { nType = 'terminal'; text = 'END'; }
    if (type === 'process') { text = 'n = 1'; }
    if (type === 'input') { text = 'x'; }
    if (type === 'print') { text = '"Output is", n'; }
    if (type === 'decision') { text = 'n <= 5'; }
    let targetPlacementX = (container.scrollLeft + 150) / zoom;
    let targetPlacementY = (container.scrollTop + 150) / zoom;
    if (globalLastSpawnedNodeReferencePointer) {
        const checkedElementDOM = document.getElementById(globalLastSpawnedNodeReferencePointer.id);
        let elementComputedHeightOffset = checkedElementDOM ? checkedElementDOM.offsetHeight : 60;
        targetPlacementX = globalLastSpawnedNodeReferencePointer.x;
        targetPlacementY = globalLastSpawnedNodeReferencePointer.y + elementComputedHeightOffset + 40;
    } else if (nodes.length > 0) {
        const finalRegisteredArrayNode = nodes[nodes.length - 1];
        const checkedElementDOM = document.getElementById(finalRegisteredArrayNode.id);
        let elementComputedHeightOffset = checkedElementDOM ? checkedElementDOM.offsetHeight : 60;
        targetPlacementX = finalRegisteredArrayNode.x;
        targetPlacementY = finalRegisteredArrayNode.y + elementComputedHeightOffset + 40;
    }
    const newNode = {
        id, type: nType,
        x: Math.round(targetPlacementX / 20) * 20,
        y: Math.round(targetPlacementY / 20) * 20,
        text: text,
        bgColor: null,
        borderColor: null
    };
    nodes.push(newNode);
    renderNode(newNode);
    globalLastSpawnedNodeReferencePointer = newNode;
}
function renderNode(node, isRestore = false) {
    const div = document.createElement('div');
    div.id = node.id;
    div.className = `node shape-${node.type}`;
    div.style.left = `${node.x}px`;
    div.style.top = `${node.y}px`;
    if (node.bgColor) div.style.backgroundColor = node.bgColor;
    if (node.borderColor) div.style.borderColor = node.borderColor;
    if (node.fontFamily) div.style.fontFamily = node.fontFamily;
    if (node.fontSize) div.style.fontSize = node.fontSize;
    const span = document.createElement('span');
    span.innerText = node.text;
    div.appendChild(span);
    ['top', 'bottom', 'left', 'right'].forEach(pos => {
        const port = document.createElement('div');
        port.className = `port port-${pos}`;
        const startLinkHandler = (e) => {
            e.stopPropagation();
            isLinking = true;
            linkSource = { nodeId: node.id, port: pos };
            let mobileTouchX = 0;
            let mobileTouchY = 0;
            if (e.touches && e.touches.length > 0) {
                mobileTouchX = e.touches[0].clientX;
                mobileTouchY = e.touches[0].clientY;
            }
            const trackMobileFingerMove = (moveEvent) => {
                if (moveEvent.touches && moveEvent.touches.length > 0) {
                    mobileTouchX = moveEvent.touches[0].clientX;
                    mobileTouchY = moveEvent.touches[0].clientY;
                }
            };
            window.addEventListener('touchmove', trackMobileFingerMove, { passive: true });
            const endLinkHandler = (me) => {
                let clientX = me.clientX;
                let clientY = me.clientY;
                if (me.touches || me.changedTouches) {
                    clientX = (me.changedTouches && me.changedTouches.length > 0) ? me.changedTouches[0].clientX : mobileTouchX;
                    clientY = (me.changedTouches && me.changedTouches.length > 0) ? me.changedTouches[0].clientY : mobileTouchY;
                }
                const targetElements = document.elementsFromPoint(clientX, clientY);
                const targetNodeEl = targetElements.find(el => el.classList.contains('node'));
                const targetPortEl = targetElements.find(el => el.classList.contains('port'));
                if (targetNodeEl && targetNodeEl.id !== node.id) {
                    saveState();
                    let targetPort = 'top';
                    if (targetPortEl) {
                        targetPort = targetPortEl.className.split(' ').find(c => c.startsWith('port-')).split('-')[1];
                    } else {
                        const rect = targetNodeEl.getBoundingClientRect();
                        const dTop = Math.abs(clientY - rect.top);
                        const dBottom = Math.abs(clientY - rect.bottom);
                        const dLeft = Math.abs(clientX - rect.left);
                        const dRight = Math.abs(clientX - rect.right);
                        const minDist = Math.min(dTop, dBottom, dLeft, dRight);
                        if (minDist === dTop) targetPort = 'top';
                        else if (minDist === dBottom) targetPort = 'bottom';
                        else if (minDist === dLeft) targetPort = 'left';
                        else if (minDist === dRight) targetPort = 'right';
                    }
                    const fromNode = nodes.find(n => n.id === node.id);
                    let label = '';
                    if (fromNode && fromNode.type === 'decision') {
                        const existingConnections = connections.filter(c => c.from === node.id);
                        label = existingConnections.length === 0 ? 'True' : 'False';
                    }
                    connections.push({
                        from: node.id, fromPort: pos,
                        to: targetNodeEl.id, toPort: targetPort,
                        label: label,
                        customOffsetX: 0,
                        customOffsetY: 0,
                        strokeColor: null
                    });
                    drawAllConnections();
                    if (isCodeVisible) generateSystemCodeView();
                }
                isLinking = false;
                window.removeEventListener('mouseup', endLinkHandler);
                window.removeEventListener('touchend', endLinkHandler);
                window.removeEventListener('touchmove', trackMobileFingerMove);
            };
            window.addEventListener('mouseup', endLinkHandler);
            window.addEventListener('touchend', endLinkHandler);
        };
        port.onmousedown = startLinkHandler;
        port.addEventListener('touchstart', startLinkHandler, { passive: true });
        div.appendChild(port);
    });
    const startMoveHandler = (e) => {
        e.stopPropagation();
        if (e.shiftKey) {
            if (selectedNodes.includes(node.id)) {
                selectedNodes = selectedNodes.filter(sid => sid !== node.id);
                div.classList.remove('selected');
            } else {
                selectedNodes.push(node.id);
                div.classList.add('selected');
            }
            openEditor(node);
            drawAllConnections();
            return;
        }
        if (e.ctrlKey || e.metaKey) {
            if (selectedNodes.length > 0 && !selectedNodes.includes(node.id)) {
                saveState();
                const primaryNodeOriginId = selectedNodes[selectedNodes.length - 1];
                const sourceOriginNodeObj = nodes.find(n => n.id === primaryNodeOriginId);
                let calculatedRoutingLabel = '';
                if (sourceOriginNodeObj && sourceOriginNodeObj.type === 'decision') {
                    const activeForkCount = connections.filter(c => c.from === primaryNodeOriginId).length;
                    calculatedRoutingLabel = activeForkCount === 0 ? 'True' : 'False';
                }
                connections.push({
                    from: primaryNodeOriginId,
                    fromPort: 'bottom',
                    to: node.id,
                    toPort: 'top',
                    label: calculatedRoutingLabel,
                    customOffsetX: 0,
                    customOffsetY: 0,
                    strokeColor: null
                });
                drawAllConnections();
                clearSelection();
                selectedNodes.push(node.id);
                div.classList.add('selected');
                openEditor(node);
                if (isCodeVisible) generateSystemCodeView();
                return;
            }
        }
        if (!e.ctrlKey && !e.metaKey && !selectedNodes.includes(node.id)) clearSelection();
        if (!selectedNodes.includes(node.id)) {
            selectedNodes.push(node.id);
            div.classList.add('selected');
        }
        const initialCoords = getEventCoords(e);
        let startX = initialCoords.clientX;
        let startY = initialCoords.clientY;
        const initialPos = {};
        selectedNodes.forEach(sid => {
            const nd = nodes.find(nod => nod.id === sid);
            if (nd) initialPos[sid] = { x: nd.x, y: nd.y };
        });
        let didMove = false;
        const onMove = (me) => {
            if (!didMove) { saveState(); didMove = true; }
            const coords = getEventCoords(me);
            const dx = (coords.clientX - startX) / zoom;
            const dy = (coords.clientY - startY) / zoom;
            selectedNodes.forEach(sid => {
                const n = nodes.find(nod => nod.id === sid);
                if (!n || !initialPos[sid]) return;
                let idealX = initialPos[sid].x + dx;
                let idealY = initialPos[sid].y + dy;
                n.x = Math.round(idealX / 20) * 20;
                n.y = Math.round(idealY / 20) * 20;
                const el = document.getElementById(sid);
                if (el) {
                    el.style.left = `${n.x}px`;
                    el.style.top = `${n.y}px`;
                }
            });
            drawAllConnections();
        };
        const onUp = (upEvent) => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('mouseup', onUp);
            window.removeEventListener('touchend', onUp);
            if (upEvent && upEvent.type === 'touchend') {
                const currentTime = new Date().getTime();
                const tapLength = currentTime - (div.lastNodeTapTime || 0);
                if (tapLength < 300 && tapLength > 0) {
                    openEditor(node);
                }
                div.lastNodeTapTime = currentTime;
            } else {
                openEditor(node);
            }
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchend', onUp);
    };
    div.onmousedown = startMoveHandler;
    div.addEventListener('touchstart', startMoveHandler, { passive: true });
    canvas.appendChild(div);
}
function drawAllConnections() {
    svg.innerHTML = `
                <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#475569" />
                    </marker>
                </defs>
            `;
    connections.forEach(conn => {
        const fromEl = document.getElementById(conn.from);
        const toEl = document.getElementById(conn.to);
        if (!fromEl || !toEl) return;
        const fRect = { x: parseInt(fromEl.style.left), y: parseInt(fromEl.style.top), w: fromEl.offsetWidth || 160, h: fromEl.offsetHeight || 60 };
        const tRect = { x: parseInt(toEl.style.left), y: parseInt(toEl.style.top), w: toEl.offsetWidth || 160, h: toEl.offsetHeight || 60 };
        let fromPort = conn.fromPort || 'bottom';
        let toPort = conn.toPort || 'top';
        let start = getPortPos(fRect, fromPort, fromEl.classList.contains('shape-decision'));
        let end = getPortPos(tRect, toPort, toEl.classList.contains('shape-decision'));
        if (activeLineEndpointHandle && activeLineEndpointHandle.conn === conn) {
            if (activeLineEndpointHandle.role === 'from') {
                start = { x: activeLineEndpointHandle.currentX, y: activeLineEndpointHandle.currentY };
            } else {
                end = { x: activeLineEndpointHandle.currentX, y: activeLineEndpointHandle.currentY };
            }
        }
        let startVector = { x: 0, y: 0 };
        if (fromPort === 'top') startVector.y = -1;
        else if (fromPort === 'bottom') startVector.y = 1;
        else if (fromPort === 'left') startVector.x = -1;
        else if (fromPort === 'right') startVector.x = 1;
        let endVector = { x: 0, y: 0 };
        if (toPort === 'top') endVector.y = -1;
        else if (toPort === 'bottom') endVector.y = 1;
        else if (toPort === 'left') endVector.x = -1;
        else if (toPort === 'right') endVector.x = 1;
        if (conn.customOffsetX === undefined) conn.customOffsetX = 0;
        if (conn.customOffsetY === undefined) conn.customOffsetY = 0;
        let escapeBufferDistance = 20; 
        let bp1 = { x: start.x + startVector.x * escapeBufferDistance, y: start.y + startVector.y * escapeBufferDistance };
        let bp2 = { x: end.x + endVector.x * escapeBufferDistance, y: end.y + endVector.y * escapeBufferDistance };
        bp1.x += conn.customOffsetX;
        bp1.y += conn.customOffsetY;
        let pathPointsMatrix = [start, bp1];
        if (startVector.x !== 0) { 
            if ((bp1.x < bp2.x && startVector.x > 0) || (bp1.x > bp2.x && startVector.x < 0)) {
                if (endVector.y !== 0) {
                    pathPointsMatrix.push({ x: bp2.x, y: bp1.y });
                } else {
                    pathPointsMatrix.push({ x: Math.round(((bp1.x + bp2.x) / 2) / 20) * 20, y: bp1.y });
                    pathPointsMatrix.push({ x: Math.round(((bp1.x + bp2.x) / 2) / 20) * 20, y: bp2.y });
                }
            } else {
                let intermediateSplitY = Math.round(((bp1.y + bp2.y) / 2) / 20) * 20;
                pathPointsMatrix.push({ x: bp1.x, y: intermediateSplitY });
                pathPointsMatrix.push({ x: bp2.x, y: intermediateSplitY });
            }
        } else { 
            if ((bp1.y < bp2.y && startVector.y > 0) || (bp1.y > bp2.y && startVector.y < 0)) {
                if (endVector.x !== 0) {
                    pathPointsMatrix.push({ x: bp1.x, y: bp2.y });
                } else {
                    pathPointsMatrix.push({ x: bp1.x, y: Math.round(((bp1.y + bp2.y) / 2) / 20) * 20 });
                    pathPointsMatrix.push({ x: bp2.x, y: Math.round(((bp1.y + bp2.y) / 2) / 20) * 20 });
                }
            } else {
                let intermediateSplitX = Math.round(((bp1.x + bp2.x) / 2) / 20) * 20;
                if (Math.abs(bp1.x - bp2.x) < 40) intermediateSplitX = bp1.x + 120 * (start.x > end.x ? -1 : 1);
                pathPointsMatrix.push({ x: intermediateSplitX, y: bp1.y });
                pathPointsMatrix.push({ x: intermediateSplitX, y: bp2.y });
            }
        }
        pathPointsMatrix.push(bp2);
        pathPointsMatrix.push(end);
        let d = `M ${pathPointsMatrix[0].x} ${pathPointsMatrix[0].y}`;
        for (let i = 1; i < pathPointsMatrix.length; i++) {
            d += ` L ${pathPointsMatrix[i].x} ${pathPointsMatrix[i].y}`;
        }
        let midPointReferenceIndex = Math.floor(pathPointsMatrix.length / 2);
        let handleX = Math.round(((pathPointsMatrix[midPointReferenceIndex - 1].x + pathPointsMatrix[midPointReferenceIndex].x) / 2) / 20) * 20;
        let handleY = Math.round(((pathPointsMatrix[midPointReferenceIndex - 1].y + pathPointsMatrix[midPointReferenceIndex].y) / 2) / 20) * 20;
        let handleType = Math.abs(pathPointsMatrix[midPointReferenceIndex - 1].x - pathPointsMatrix[midPointReferenceIndex].x) > 0 ? 'H' : 'V';
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('class', `flow-line ${selectedLines.includes(conn) ? 'selected' : ''}`);
        path.setAttribute('marker-end', 'url(#arrowhead)');
        if (conn.strokeColor) {
            path.style.stroke = conn.strokeColor;
        }
        path.style.pointerEvents = 'auto';
        const selectLineHandler = (e) => {
            e.stopPropagation();
            clearSelection();
            selectedLines.push(conn);
            path.setAttribute('class', 'flow-line selected');
            openEdgeEditor(conn);
            drawAllConnections();
        };
        path.onmousedown = selectLineHandler;
        svg.appendChild(path);
        if (selectedLines.includes(conn)) {
            const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            handle.setAttribute('cx', handleX);
            handle.setAttribute('cy', handleY);
            handle.setAttribute('r', '8');
            handle.setAttribute('class', `line-handle ${handleType === 'H' ? 'line-handle-horiz' : ''}`);
            handle.style.pointerEvents = 'auto';
            const startBendDrag = (e) => {
                e.stopPropagation();
                activeLineHandle = { conn: conn, type: handleType, baseX: start.x, baseY: start.y };
            };
            handle.onmousedown = startBendDrag;
            handle.addEventListener('touchstart', startBendDrag, { passive: true });
            svg.appendChild(handle);
            const sourceHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            sourceHandle.setAttribute('cx', start.x);
            sourceHandle.setAttribute('cy', start.y);
            sourceHandle.setAttribute('r', '7');
            sourceHandle.setAttribute('class', 'endpoint-handle');
            sourceHandle.style.pointerEvents = 'auto';
            const startSrcDrag = (e) => {
                e.stopPropagation();
                activeLineEndpointHandle = { conn: conn, role: 'from', currentX: start.x, currentY: start.y };
            };
            sourceHandle.onmousedown = startSrcDrag;
            sourceHandle.addEventListener('touchstart', startSrcDrag, { passive: true });
            svg.appendChild(sourceHandle);
            const targetHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            targetHandle.setAttribute('cx', end.x);
            targetHandle.setAttribute('cy', end.y);
            targetHandle.setAttribute('r', '7');
            targetHandle.setAttribute('class', 'endpoint-handle');
            targetHandle.style.pointerEvents = 'auto';
            const startDstDrag = (e) => {
                e.stopPropagation();
                activeLineEndpointHandle = { conn: conn, role: 'to', currentX: end.x, currentY: end.y };
            };
            targetHandle.onmousedown = startDstDrag;
            targetHandle.addEventListener('touchstart', startDstDrag, { passive: true });
            svg.appendChild(targetHandle);
        }
        if (conn.label) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            let labelX = fromPort === 'right' ? start.x + 25 : (fromPort === 'left' ? start.x - 25 : start.x + 15);
            let labelY = fromPort === 'bottom' ? start.y + 20 : (fromPort === 'top' ? start.y - 15 : start.y - 8);
            text.setAttribute('x', labelX);
            text.setAttribute('y', labelY);
            text.setAttribute('fill', conn.label.toLowerCase() === 'true' ? '#10b981' : '#ef4444');
            text.setAttribute('font-size', '12px');
            text.setAttribute('font-weight', 'bold');
            text.setAttribute('text-anchor', 'middle');
            text.textContent = conn.label;
            svg.appendChild(text);
        }
    });
}
function getPortPos(rect, port, isDecision = false) {
    let pt = { x: 0, y: 0 };
    if (isDecision) {
        const cx = rect.x + 60;
        const cy = rect.y + 60;
        if (port === 'top') pt = { x: cx, y: cy - 80 };
        else if (port === 'bottom') pt = { x: cx, y: cy + 80 };
        else if (port === 'left') pt = { x: cx - 80, y: cy };
        else if (port === 'right') pt = { x: cx + 80, y: cy };
    } else {
        let w = rect.w || 160;
        let h = rect.h || 60;
        if (port === 'top') pt = { x: rect.x + w / 2, y: rect.y };
        else if (port === 'bottom') pt = { x: rect.x + w / 2, y: rect.y + h };
        else if (port === 'left') pt = { x: rect.x, y: rect.y + h / 2 };
        else if (port === 'right') pt = { x: rect.x + w, y: rect.y + h / 2 };
    }
    return {
        x: Math.round(pt.x / 20) * 20,
        y: Math.round(pt.y / 20) * 20
    };
}
function openEditor(node) {
    activeEditingLine = null;
    document.getElementById('editor-title').innerText = "Node Properties";
    document.getElementById('node-text-container').classList.remove('hidden');
    document.getElementById('node-style-container').classList.remove('hidden');
    document.getElementById('line-style-container').classList.add('hidden');
    document.getElementById('line-dropdown-container').classList.add('hidden');
    document.getElementById('quick-operators-container').classList.remove('hidden');
    const fontContainer = document.getElementById('node-font-container');
    if (fontContainer) {
        fontContainer.classList.remove('hidden');
        const familySelect = document.getElementById('node-font-family');
        const sizeSelect = document.getElementById('node-font-size');
        familySelect.value = node.fontFamily || "sans-serif";
        sizeSelect.value = node.fontSize || "13px";
        familySelect.onchange = (e) => {
            saveState();
            node.fontFamily = e.target.value;
            document.getElementById(node.id).style.fontFamily = node.fontFamily;
        };
        sizeSelect.onchange = (e) => {
            saveState();
            node.fontSize = e.target.value;
            document.getElementById(node.id).style.fontSize = node.fontSize;
        };
    }
    const input = document.getElementById('node-text');
    input.value = node.text;
    input.oninput = (e) => {
        node.text = e.target.value;
        const targetDOMNodeSpan = document.getElementById(node.id).querySelector('span');
        if (targetDOMNodeSpan) targetDOMNodeSpan.innerText = node.text;
        if (isCodeVisible) generateSystemCodeView();
    };
    const bgPicker = document.getElementById('node-bg-picker');
    const borderPicker = document.getElementById('node-border-picker');
    bgPicker.value = node.bgColor || "#ffffff";
    borderPicker.value = node.borderColor || "#cccccc";
    bgPicker.oninput = (e) => {
        node.bgColor = e.target.value;
        document.getElementById(node.id).style.backgroundColor = node.bgColor;
    };
    borderPicker.oninput = (e) => {
        node.borderColor = e.target.value;
        document.getElementById(node.id).style.borderColor = node.borderColor;
    };
    document.getElementById('editor').classList.remove('translate-x-full');
}
function openEdgeEditor(conn) {
    activeEditingLine = conn;
    document.getElementById('editor-title').innerText = "Line Connector Properties";
    document.getElementById('node-text-container').classList.add('hidden');
    document.getElementById('node-style-container').classList.add('hidden');
    document.getElementById('line-style-container').classList.remove('hidden');
    document.getElementById('quick-operators-container').classList.add('hidden');
    const fontContainer = document.getElementById('node-font-container');
    if (fontContainer) fontContainer.classList.add('hidden');
    const colorPicker = document.getElementById('line-color-picker');
    colorPicker.value = conn.strokeColor || "#475569";
    colorPicker.oninput = (e) => {
        conn.strokeColor = e.target.value;
        drawAllConnections();
    };
    const fromPortSelect = document.getElementById('line-from-port');
    const toPortSelect = document.getElementById('line-to-port');
    fromPortSelect.value = conn.fromPort || "bottom";
    toPortSelect.value = conn.toPort || "top";
    fromPortSelect.onchange = (e) => {
        saveState();
        conn.fromPort = e.target.value;
        drawAllConnections();
    };
    toPortSelect.onchange = (e) => {
        saveState();
        conn.toPort = e.target.value;
        drawAllConnections();
    };
    const fromNode = nodes.find(n => n.id === conn.from);
    if (fromNode && fromNode.type === 'decision') {
        document.getElementById('line-dropdown-container').classList.remove('hidden');
        const dropdown = document.getElementById('line-label-dropdown');
        dropdown.value = conn.label || "";
        dropdown.onchange = (e) => {
            saveState();
            conn.label = e.target.value;
            drawAllConnections();
        };
    } else {
        document.getElementById('line-dropdown-container').classList.add('hidden');
    }
    document.getElementById('editor').classList.remove('translate-x-full');
}
function closeEditor() {
    document.getElementById('editor').classList.add('translate-x-full');
}
function clearSelection() {
    selectedNodes.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('selected');
    });
    selectedNodes = [];
    selectedLines = [];
    drawAllConnections();
}
function centerActiveWorkspaceMatrixContents() {
    if (nodes.length === 0) return;
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
        if (n.x < minX) minX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.x > maxX) maxX = n.x;
        if (n.y > maxY) maxY = n.y;
    });
    const currentContainerWidth = container.offsetWidth;
    const currentContainerHeight = container.offsetHeight;
    const contentWidthCenterOffset = minX - (currentContainerWidth / 2) + 80;
    const contentHeightCenterOffset = minY - (currentContainerHeight / 2) + 30;
    container.scrollLeft = Math.max(0, contentWidthCenterOffset);
    container.scrollTop = Math.max(0, contentHeightCenterOffset);
}
function addSymbol(sym) {
    const input = document.getElementById('node-text');
    if (!document.getElementById('node-text-container').classList.contains('hidden')) {
        input.value += `${sym}`;
        input.dispatchEvent(new Event('input'));
        input.focus();
    }
}
function deleteSelection() {
    saveState();
    if (selectedNodes.length > 0) {
        selectedNodes.forEach(id => {
            nodes = nodes.filter(n => n.id !== id);
            connections = connections.filter(c => c.from !== id && c.to !== id);
            const el = document.getElementById(id);
            if (el) el.remove();
            if (globalLastSpawnedNodeReferencePointer && globalLastSpawnedNodeReferencePointer.id === id) {
                globalLastSpawnedNodeReferencePointer = null;
            }
        });
    }
    if (activeEditingLine) {
        connections = connections.filter(c => c !== activeEditingLine);
        activeEditingLine = null;
    }
    drawAllConnections();
    closeEditor();
    clearSelection();
    if (isCodeVisible) generateSystemCodeView();
}
function saveProjectFile() {
    const packageData = {
        version: "2.5-STABLE",
        workspaces: workspaces,
        activeWorkspace: activeWorkspace
    };
    const stream = JSON.stringify(packageData, null, 2);
    const blob = new Blob([stream], { type: "application/fl+json" });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${activeWorkspace.replace(/\s+/g, '_')}_project.fl`;
    anchor.click();
    callPremiumModalAlert("ඔබගේ ව්‍යාපෘති ගොනුව සාර්ථකව පරිගණකය තුළ සුරැකින.", "සුරැකීම සාර්ථකයි", "green");
}
function triggerFileLoad() {
    document.getElementById('project-file-input').click();
}
function loadProjectFile(event) {
    const input = event.target;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const parsed = JSON.parse(e.target.result);
            if (parsed.workspaces) {
                workspaces = parsed.workspaces;
                activeWorkspace = parsed.activeWorkspace || Object.keys(workspaces)[0];
                updateWorkspaceTabsUI();
                loadWorkspaceState(activeWorkspace);
                callPremiumModalAlert("ගොනුවේ දත්ත පද්ධතිය සාර්ථකව පූරණය කරන ලදී.", "පූරණය සාර්ථකයි", "green");
            }
        } catch (err) {
            callPremiumModalAlert("Registry Compilation Error: Invalid .fl file architecture format.", "ගොනු දෝෂයක්", "red");
        }
    };
    reader.readAsText(file);
}
function exportToPDF() {
    const { jsPDF } = window.jspdf;
    if (nodes.length === 0) {
        callPremiumModalAlert("No structural elements detected to export.", "නිකුත් කිරීමේ දෝෂයක්", "red");
        return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
        if (n.x < minX) minX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.x + 180 > maxX) maxX = n.x + 180;
        if (n.y + 120 > maxY) maxY = n.y + 120;
    });
    minX = Math.max(0, minX - 40);
    minY = Math.max(0, minY - 40);
    let frameWidth = (maxX - minX) + 80;
    let frameHeight = (maxY - minY) + 80;
    const doc = new jsPDF('l', 'mm', 'a4');
    html2canvas(canvas, {
        scale: 1.5,
        useCORS: true,
        backgroundColor: "#f8fafc",
        x: minX,
        y: minY,
        width: frameWidth,
        height: frameHeight
    }).then(renderCanvas => {
        const imgData = renderCanvas.toDataURL('image/png');
        doc.addImage(imgData, 'PNG', 10, 10, 277, 190);
        doc.save(`Flowchart_Document_${Date.now()}.pdf`);
        callPremiumModalAlert("ඔබගේ Flowchart සටහන උසස් තත්ත්වයේ PDF ලේඛනයක් ලෙස නිකුත් කරන ලදී.", "නිකුත් කිරීම සාර්ථකයි", "green");
    });
}
function updateWorkspaceTabsUI() {
    const container = document.getElementById('workspace-tabs-container');
    container.innerHTML = "";
    Object.keys(workspaces).forEach(wName => {
        const tab = document.createElement('div');
        tab.className = `h-full px-4 flex items-center gap-2 border-r font-semibold text-xs cursor-pointer transition-all select-none ${wName === activeWorkspace ? 'bg-white text-blue-600 border-t-2 border-t-blue-600' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`;
        const titleSpan = document.createElement('span');
        titleSpan.innerText = wName;
        titleSpan.title = "Double-click to Rename Workspace";
        titleSpan.onclick = () => switchWorkspaceWindow(wName);
        let lastTap = 0;
        tab.addEventListener('touchend', (e) => {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;
            if (tapLength < 300 && tapLength > 0) {
                e.preventDefault();
                renameWorkspaceWindow(wName);
            }
            lastTap = currentTime;
        });
        titleSpan.ondblclick = (e) => { e.stopPropagation(); renameWorkspaceWindow(wName); };
        tab.appendChild(titleSpan);
        if (Object.keys(workspaces).length > 1) {
            const closeBtn = document.createElement('button');
            closeBtn.className = "text-slate-400 hover:text-red-500 ml-1 font-bold text-sm";
            closeBtn.innerText = "×";
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                deleteWorkspaceWindow(wName);
            };
            tab.appendChild(closeBtn);
        }
        container.appendChild(tab);
    });
}
function showCustomPrompt(message, defaultValue = "", icon = "help-circle") {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-prompt-modal');
        const label = document.getElementById('custom-prompt-label');
        const input = document.getElementById('custom-prompt-input');
        const cancelBtn = document.getElementById('custom-prompt-cancel');
        const submitBtn = document.getElementById('custom-prompt-submit');
        const iconEl = document.getElementById('custom-prompt-icon');
        if (iconEl) {
            const parent = iconEl.parentNode;
            parent.innerHTML = `<i id="custom-prompt-icon" data-lucide="${icon}" class="w-5 h-5"></i>`;
            lucide.createIcons();
        }
        label.innerText = message;
        input.value = defaultValue;
        modal.classList.remove('hidden');
        setTimeout(() => input.focus(), 50);
        const cleanup = () => {
            modal.classList.add('hidden');
            cancelBtn.onclick = null;
            submitBtn.onclick = null;
            input.onkeydown = null;
        };
        cancelBtn.onclick = () => {
            cleanup();
            resolve(null);
        };
        submitBtn.onclick = () => {
            cleanup();
            resolve(input.value);
        };
        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                cleanup();
                resolve(input.value);
            }
            if (e.key === 'Escape') {
                cleanup();
                resolve(null);
            }
        };
    });
}
async function renameWorkspaceWindow(oldName) {
    let newName = await showCustomPrompt("Enter new name for this workspace window:", oldName, "edit-3");
    if (!newName || newName.trim() === "" || newName.trim() === oldName) return;
    newName = newName.trim();
    if (workspaces[newName]) {
        callPremiumModalAlert("A workspace file module with this name specification already exists.", "නම් කිරීමේ දෝෂයක්", "red");
        return;
    }
    workspaces[newName] = workspaces[oldName];
    delete workspaces[oldName];
    if (activeWorkspace === oldName) activeWorkspace = newName;
    updateWorkspaceTabsUI();
    saveState();
}
function addNewWorkspaceWindow() {
    const newIndex = Object.keys(workspaces).length + 1;
    const wName = `Workspace ${newIndex}`;
    workspaces[wName] = { nodes: [], connections: [], history: [] };
    activeWorkspace = wName;
    updateWorkspaceTabsUI();
    loadWorkspaceState(wName);
}
function switchWorkspaceWindow(wName) {
    workspaces[activeWorkspace].nodes = JSON.parse(JSON.stringify(nodes));
    workspaces[activeWorkspace].connections = JSON.parse(JSON.stringify(connections));
    workspaces[activeWorkspace].history = JSON.parse(JSON.stringify(history));
    activeWorkspace = wName;
    updateWorkspaceTabsUI();
    loadWorkspaceState(wName);
}
async function deleteWorkspaceWindow(wName) {
    let userConfirmationFlag = await callPremiumModalAlert(`ඔබට සැබවින්ම "${wName}" ඉවත් කිරීමට අවශ්‍යද?`, "Workspace එක ඉවත් කිරීම", "red", "confirm");
    if (userConfirmationFlag) {
        delete workspaces[wName];
        if (activeWorkspace === wName) {
            activeWorkspace = Object.keys(workspaces)[0];
        }
        updateWorkspaceTabsUI();
        loadWorkspaceState(activeWorkspace);
    }
}
function loadWorkspaceState(wName) {
    document.querySelectorAll('.node').forEach(el => el.remove());
    nodes = JSON.parse(JSON.stringify(workspaces[wName].nodes || []));
    connections = JSON.parse(JSON.stringify(workspaces[wName].connections || []));
    history = JSON.parse(JSON.stringify(workspaces[wName].history || []));
    nodes.forEach(n => renderNode(n, true));
    drawAllConnections();
    clearSelection();
    closeEditor();
    globalLastSpawnedNodeReferencePointer = nodes.length > 0 ? nodes[nodes.length - 1] : null;
    setTimeout(centerActiveWorkspaceMatrixContents, 100);
}
async function runLogic() {
    const runBtn = document.getElementById('run-engine-btn');
    if (!runBtn || runBtn.classList.contains('hidden')) return;
    runBtn.classList.add('hidden');
    runBtn.classList.remove('flex');
    const stopBtn = document.getElementById('stop-engine-btn');
    if (stopBtn) {
        stopBtn.classList.remove('hidden');
        stopBtn.classList.add('flex');
    }
    isExecutionHalted = false;
    try {
        await executeFlowchart();
    } finally {
        if (stopBtn) {
            stopBtn.classList.add('hidden');
            stopBtn.classList.remove('flex');
        }
        runBtn.classList.remove('hidden');
        runBtn.classList.add('flex');
    }
}
async function executeFlowchart() {
    const panel = document.getElementById('bottom-panel');
    const progOutput = document.getElementById('program-output-view');
    const traceLog = document.getElementById('trace-log-view');
    panel.classList.remove('hidden');
    progOutput.innerHTML = "";
    traceLog.innerHTML = "<div class='text-blue-400 font-bold'>[ENGINE INITIALIZATION] Booting system pipelines...</div>";
    let startNode = nodes.find(n => n.type === 'terminal' && n.text.toUpperCase().includes('START'));
    if (!startNode) {
        traceLog.innerHTML += "<div class='text-red-500 font-bold'>[FATAL REGISTRY ERROR] Trace execution failed: Missing 'START' terminal base node structure.</div>";
        return;
    }
    let env = {};
    let currentNode = startNode;
    let maxCycles = 500;
    let cycleCount = 0;
    while (currentNode && cycleCount < maxCycles) {
        if (isExecutionHalted) {
            traceLog.innerHTML += "<div class='text-red-500 font-bold'>[EXECUTION HALTED] Simulation stopped dynamically by user.</div>";
            break;
        }
        cycleCount++;
        const el = document.getElementById(currentNode.id);
        if (el) {
            el.style.boxShadow = "0 0 25px #2563eb";
            el.style.borderColor = "#2563eb";
        }
        await new Promise(r => setTimeout(r, 350));
        if (el) {
            el.style.boxShadow = "";
            el.style.borderColor = currentNode.borderColor || "";
        }
        let logicStr = currentNode.text.trim();
        traceLog.innerHTML += `<div>[STEP ${cycleCount}] Evaluating ${currentNode.type.toUpperCase()} block: <span class='text-slate-200'>"${logicStr}"</span></div>`;
        if (currentNode.type === 'terminal' && (logicStr.toUpperCase().includes('END') || logicStr.toUpperCase().includes('STOP'))) {
            traceLog.innerHTML += "<div class='text-emerald-400 font-bold'>[PROCESS EXITED] Pipeline stack finished execution mapping chain successfully.</div>";
            break;
        }
        if (currentNode.type === 'input') {
            let inputLines = logicStr.split('\n');
            for (let line of inputLines) {
                line = line.trim();
                if (!line) continue;
                let field = line;
                let promptMsg = `[INPUT COMPONENT] Enter variable literal data for: ${field}`;
                if (line.includes(':')) {
                    let parts = line.split(':');
                    field = parts[0].trim();
                    promptMsg = parts[1].trim().replace(/^["']|["']$/g, '');
                }
                let inputVal = await showCustomPrompt(promptMsg, "", "terminal");
                if (inputVal === null) {
                    traceLog.innerHTML += "<div class='text-red-400'>[ABORTED] Simulation halted dynamically by user interface trigger intercept.</div>";
                    return;
                }
                env[field] = isNaN(inputVal) || inputVal === "" ? inputVal : Number(inputVal);
                traceLog.innerHTML += `<div class='text-pink-400 text-[11px]'>&nbsp;&nbsp;→ Assigned memory state allocation vector: ${field} = ${env[field]}</div>`;
            }
        }
        else if (currentNode.type === 'process') {
            try {
                let statements = logicStr.split(/[\n;]+/);
                for (let stmt of statements) {
                    stmt = stmt.trim();
                    if (!stmt || !stmt.includes('=')) continue;
                    let dynamicCtx = "";
                    for (let variable in env) { dynamicCtx += `let ${variable} = ${JSON.stringify(env[variable])};\n`; }
                    let targetVar = stmt.split('=')[0].trim();
                    let computedValue = eval(dynamicCtx + stmt + `; ${targetVar};`);
                    env[targetVar] = computedValue;
                    traceLog.innerHTML += `<div class='text-blue-400 text-[11px]'>&nbsp;&nbsp;→ Updated Memory State: ${targetVar} = ${computedValue}</div>`;
                }
            } catch (err) {
                traceLog.innerHTML += `<div class='text-red-500 font-bold'>[COMPILATION ERROR] Process syntax evaluation fault: ${err.message}</div>`;
                return;
            }
        }
        else if (currentNode.type === 'print') {
            try {
                let printLines = logicStr.split('\n');
                for (let line of printLines) {
                    line = line.trim();
                    if (!line) continue;
                    let dynamicCtx = "";
                    for (let variable in env) { dynamicCtx += `let ${variable} = ${JSON.stringify(env[variable])};\n`; }
                    let parsedArgs = eval(dynamicCtx + `[${line}]`);
                    let outputString = parsedArgs.join(' ');
                    let textSegments = outputString.split('\\n');
                    textSegments.forEach(segment => {
                        progOutput.innerHTML += `<div class='bg-slate-950/50 border-l-4 border-yellow-500 px-3 py-1 rounded-r text-yellow-300 shadow-sm font-mono'>${segment}</div>`;
                    });
                }
            } catch (err) {
                progOutput.innerHTML += `<div class='bg-slate-950/50 border-l-4 border-yellow-500 px-3 py-1 rounded-r text-yellow-300 shadow-sm font-mono'>${logicStr}</div>`;
            }
        }
        let outEdges = connections.filter(c => c.from === currentNode.id);
        if (outEdges.length === 0) {
            if (currentNode.type !== 'terminal') {
                traceLog.innerHTML += "<div class='text-red-400'>[FATAL BRANCH FAULT] Unlinked pointer reference matrix detected. Build terminal structure loops cleanly.</div>";
            }
            break;
        }
        if (currentNode.type === 'decision') {
            try {
                let dynamicCtx = "";
                for (let variable in env) { dynamicCtx += `let ${variable} = ${JSON.stringify(env[variable])};\n`; }
                let branchConditionResult = eval(dynamicCtx + `Boolean(${logicStr})`);
                let targetLabel = branchConditionResult ? 'True' : 'False';
                traceLog.innerHTML += `<div>[DECISION CONDITIONAL] Vector resolved to branch state fork: <span class='text-amber-400 font-bold'>${targetLabel}</span></div>`;
                let routeEdge = outEdges.find(c => c.label && c.label.trim().toLowerCase() === targetLabel.toLowerCase());
                if (!routeEdge) {
                    traceLog.innerHTML += `<div class='text-red-500 font-bold'>[ROUTING EXCEPTION] Decision evaluated to '${targetLabel}', but no line route was labeled as '${targetLabel}' drop-down.</div>`;
                    return;
                }
                currentNode = nodes.find(n => n.id === routeEdge.to);
            } catch (err) {
                traceLog.innerHTML += `<div class='text-red-500 font-bold'>[EVALUATION FAULT] Conditional evaluation breakdown: ${err.message}</div>`;
                return;
            }
        } else {
            currentNode = nodes.find(n => n.id === outEdges[0].to);
        }
    }
    if (cycleCount >= maxCycles) {
        traceLog.innerHTML += "<div class='text-red-500 font-bold'>[TIMEOUT PROTECTION LOCK] Infinite execution sequence loop isolated and halted.</div>";
    }
    panel.scrollTop = panel.scrollHeight;
}
function generateSystemCodeView() {
    const pyOut = document.getElementById('python-output');
    if (nodes.length === 0) { pyOut.innerText = ""; return; }
    let codeTrace = "/* Flowchart Architectural Map Logic Compilation Registry */\n";
    nodes.forEach(n => { codeTrace += `Block_${n.id} (${n.type.toUpperCase()}): Exec -> { ${n.text} }\n`; });
    pyOut.innerText = codeTrace;
}
container.onclick = (e) => {
    if (e.target === container || e.target === svg) {
        clearSelection();
        closeEditor();
    }
};
window.addEventListener('keydown', (e) => {
    const isInputFieldActive = document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT';
    if (e.key === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); }
    if (e.key === 'y' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); redo(); }
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!isInputFieldActive && document.activeElement.tagName !== 'SELECT') deleteSelection();
    }
    if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
        if (!isInputFieldActive) { e.preventDefault(); performCoreClipboardCopySystem(); }
    }
    if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
        if (!isInputFieldActive) { e.preventDefault(); performCoreClipboardPasteSystem(); }
    }
    if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
        if (!isInputFieldActive) { e.preventDefault(); performCoreClipboardDuplicateSystem(); }
    }
});
loadPersistedCacheOnBoot();
