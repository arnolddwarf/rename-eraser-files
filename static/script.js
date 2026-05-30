// ==========================================================================
// ESTADO GLOBAL DE LA APLICACIÓN
// ==========================================================================
const state = {
    mediaType: 'tv',          // 'tv' o 'movie'
    language: 'en-US',        // Idioma del renombrado ('es-ES', 'en-US', 'ja-JP')
    provider: 'tmdb',         // Proveedor de metadatos ('tmdb' o 'filmaffinity')
    selectedId: null,         // ID de TMDB/FilmAffinity seleccionado
    selectedTitle: null,      // Título seleccionado
    selectedYear: null,       // Año seleccionado
    selectedPoster: null,     // Poster URL seleccionado
    files: [],                // Rutas de archivos seleccionados
    plan: [],                 // Plan de renombrado analizado
    unchecked: new Set()      // Conjunto de rutas de archivos desmarcados
};

// Elementos DOM
const dom = {
    // Elementos Globales y Tabs
    tabs: document.querySelectorAll('.nav-tab'),
    tabContents: document.querySelectorAll('.tab-content'),
    loaderOverlay: document.getElementById('loader-overlay'),
    loaderText: document.getElementById('loader-text'),

    // Pestaña Renombrador
    providerSelect: document.getElementById('provider-select'),
    searchTypeRadio: document.getElementsByName('search_type'),
    langSelect: document.getElementById('lang-select'),
    searchInput: document.getElementById('search-input'),
    searchResults: document.getElementById('search-results'),
    
    selectionCard: document.getElementById('selection-card'),
    selectedPoster: document.getElementById('selected-poster'),
    selectedBadge: document.getElementById('selected-badge'),
    selectedTitle: document.getElementById('selected-title'),
    selectedMeta: document.getElementById('selected-meta'),
    
    btnSelect: document.getElementById('btn-select'),
    btnAnalyze: document.getElementById('btn-analyze'),
    btnRename: document.getElementById('btn-rename'),
    btnReset: document.getElementById('btn-reset'),
    
    filesBody: document.getElementById('files-body'),
    filesCount: document.getElementById('files-count'),

    // Pestaña Limpiador
    btnCleanerSelectFiles: document.getElementById('btn-cleaner-select-files'),
    btnCleanerSelectFolder: document.getElementById('btn-cleaner-select-folder'),
    btnCleanerAnalyze: document.getElementById('btn-cleaner-analyze'),
    btnCleanerClear: document.getElementById('btn-cleaner-clear'),
    btnCleanerReset: document.getElementById('btn-cleaner-reset'),
    btnCleanerProcess: document.getElementById('btn-cleaner-process'),
    cleanerFilesCard: document.getElementById('cleaner-files-card'),
    cleanerFilesList: document.getElementById('cleaner-files-list'),
    cleanerFilesCount: document.getElementById('cleaner-files-count'),
    consoleLogs: document.getElementById('console-logs')
};

// ==========================================================================
// INICIALIZACIÓN Y EVENTOS
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Manejo de cambio de pestaña (Tabs)
    dom.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.getAttribute('data-tab');
            
            // Cambiar clase activa en los botones
            dom.tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Cambiar visibilidad de los contenidos de pestañas
            dom.tabContents.forEach(content => {
                if (content.id === `tab-content-${targetTab}`) {
                    content.classList.add('active');
                    content.style.display = 'grid'; // .main-layout usa display grid
                } else {
                    content.classList.remove('active');
                    content.style.display = 'none';
                }
            });
            
            setStatus(`Cambio a pestaña: ${targetTab}`);
        });
    });

    // Cambio de tipo de medio (Serie / Película)
    dom.searchTypeRadio.forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.mediaType = e.target.value;
            dom.searchInput.placeholder = state.mediaType === 'tv' 
                ? 'Ej. Breaking Bad, Los Simpson...' 
                : 'Ej. Interstellar, El Padrino...';
            // Limpiar resultados y selección al cambiar tipo
            clearSelection();
            dom.searchResults.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-search"></i>
                    <p>Escribe el nombre de una ${state.mediaType === 'tv' ? 'serie' : 'película'} para buscarla</p>
                </div>
            `;
        });
    });

    // Variable para debouncing de la búsqueda
    let searchTimeout = null;

    // Búsqueda en tiempo real (debounced) conforme escribe el usuario
    dom.searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            performSearch();
        }, 400);
    });

    // Búsqueda al pulsar Enter
    dom.searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            clearTimeout(searchTimeout);
            performSearch();
        }
    });

    // Selección de archivos nativos (Renombrador)
    dom.btnSelect.addEventListener('click', selectFiles);

    // Analizar nombres (Renombrador)
    dom.btnAnalyze.addEventListener('click', analyzeFiles);

    // Ejecutar renombrado (Renombrador)
    dom.btnRename.addEventListener('click', executeRename);

    // Reiniciar todo (Renombrador)
    dom.btnReset.addEventListener('click', resetAll);

    // Seleccionar/Deseleccionar todos los archivos (Renombrador)
    const selectAllChk = document.getElementById('chk-select-all');
    if (selectAllChk) {
        selectAllChk.addEventListener('change', (e) => {
            const checked = e.target.checked;
            state.files.forEach(filepath => {
                const planItem = state.plan.find(p => p.ruta_original === filepath);
                const isRenamed = planItem && planItem.renamed;
                if (!isRenamed) {
                    if (checked) {
                        state.unchecked.delete(filepath);
                    } else {
                        state.unchecked.add(filepath);
                    }
                }
            });
            renderFilesTable();
            validateButtons();
        });
    }

    // Cambio de idioma de nombres (Renombrador)
    dom.langSelect.addEventListener('change', (e) => {
        state.language = e.target.value;
        // Si hay una búsqueda activa, volver a buscar
        if (dom.searchInput.value.trim()) {
            performSearch();
        }
    });

    // Cambio de proveedor de metadatos (Renombrador)
    dom.providerSelect.addEventListener('change', (e) => {
        state.provider = e.target.value;
        // Si hay una búsqueda activa, volver a buscar
        if (dom.searchInput.value.trim()) {
            performSearch();
        }
    });

    // Eventos del Limpiador MKV
    if (dom.btnCleanerSelectFiles) {
        dom.btnCleanerSelectFiles.addEventListener('click', () => selectCleanerFiles('files'));
    }
    if (dom.btnCleanerSelectFolder) {
        dom.btnCleanerSelectFolder.addEventListener('click', () => selectCleanerFiles('folder'));
    }
    if (dom.btnCleanerAnalyze) {
        dom.btnCleanerAnalyze.addEventListener('click', analyzeCleanerFiles);
    }
    if (dom.btnCleanerClear) {
        dom.btnCleanerClear.addEventListener('click', clearCleanerLogs);
    }
    if (dom.btnCleanerReset) {
        dom.btnCleanerReset.addEventListener('click', resetCleanerAll);
    }
    if (dom.btnCleanerProcess) {
        dom.btnCleanerProcess.addEventListener('click', processCleanerFiles);
    }
});

// ==========================================================================
// FUNCIONES AUXILIARES DE UI
// ==========================================================================
function setStatus(msg) {
    console.log(msg);
}

function showLoader(text) {
    dom.loaderText.textContent = text;
    dom.loaderOverlay.classList.add('active');
}

function hideLoader() {
    dom.loaderOverlay.classList.remove('active');
}

function clearSelection() {
    state.selectedId = null;
    state.selectedTitle = null;
    state.selectedYear = null;
    state.selectedPoster = null;
    dom.selectionCard.style.display = 'none';
    validateButtons();
}

function resetAll() {
    state.selectedId = null;
    state.selectedTitle = null;
    state.selectedYear = null;
    state.selectedPoster = null;
    state.files = [];
    state.plan = [];
    state.unchecked.clear();
    state.language = 'en-US';
    state.provider = 'tmdb';
    
    dom.providerSelect.value = 'tmdb';
    dom.langSelect.value = 'en-US';
    dom.searchInput.value = '';
    dom.selectionCard.style.display = 'none';
    dom.filesCount.textContent = '0 archivos cargados';
    
    const selectAllChk = document.getElementById('chk-select-all');
    if (selectAllChk) selectAllChk.checked = true;
    
    dom.searchResults.innerHTML = `
        <div class="empty-state">
            <i class="fa-solid fa-search"></i>
            <p>Escribe el nombre de una ${state.mediaType === 'tv' ? 'serie' : 'película'} para buscarla</p>
        </div>
    `;
    
    renderFilesTable();
    validateButtons();
    setStatus('Aplicación reiniciada. Estado limpio.');
}

function validateButtons() {
    // Ignorar archivos ya renombrados exitosamente
    const checkedFilesCount = state.files.filter(f => {
        if (state.unchecked.has(f)) return false;
        const planItem = state.plan.find(p => p.ruta_original === f);
        return !(planItem && planItem.renamed);
    }).length;
    
    const planCheckedAndValid = state.plan.filter(p => p.nombre_nuevo && !state.unchecked.has(p.ruta_original) && !p.renamed).length;

    // Habilitar analizar si hay ID de TMDB seleccionado y hay al menos un archivo marcado para analizar
    dom.btnAnalyze.disabled = !(state.selectedId && checkedFilesCount > 0);
    // Habilitar renombrar si hay un plan activo con al menos un archivo con nombre sugerido que esté chequeado
    dom.btnRename.disabled = !(planCheckedAndValid > 0);
    
    // Mostrar/ocultar el botón de Reiniciar según si hay archivos cargados
    if (state.files.length > 0) {
        dom.btnReset.style.display = 'inline-flex';
    } else {
        dom.btnReset.style.display = 'none';
    }
}

// Extrae el nombre de archivo de una ruta completa (soporta barra normal y invertida)
function getBasename(path) {
    return path.split(/[/\\]/).pop();
}

// ==========================================================================
// ACCIONES API (BACKEND FETCH)
// ==========================================================================

// 1. Buscar en Catálogo (TMDB o FilmAffinity)
async function performSearch() {
    const query = dom.searchInput.value.trim();
    if (!query) return;

    setStatus(`Buscando "${query}" en ${state.provider === 'filmaffinity' ? 'FilmAffinity' : 'TMDB'}...`);
    dom.searchResults.innerHTML = `
        <div class="empty-state">
            <div class="spinner"></div>
            <p>Buscando en la base de datos...</p>
        </div>
    `;

    try {
        const response = await fetch('/api/buscar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, tipo: state.mediaType, idioma: state.language, proveedor: state.provider })
        });
        const data = await response.json();

        if (data.status === 'success' && data.results && data.results.length > 0) {
            renderSearchResults(data.results);
            setStatus(`Búsqueda completada. Se encontraron ${data.results.length} resultados.`);
        } else {
            dom.searchResults.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-face-frown"></i>
                    <p>No se encontraron resultados para "${query}"</p>
                </div>
            `;
            setStatus('No se encontraron resultados.');
            showToast(`No se encontraron resultados para "${query}"`, 'warning');
        }
    } catch (err) {
        console.error(err);
        dom.searchResults.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>Error al conectar con el servidor.</p>
            </div>
        `;
        setStatus('Error de conexión al realizar la búsqueda.');
        showToast('Error de conexión al realizar la búsqueda.', 'error');
    }
}

// Renderiza la lista de resultados de búsqueda
function renderSearchResults(results) {
    dom.searchResults.innerHTML = '';
    
    results.forEach(item => {
        const div = document.createElement('div');
        div.className = 'result-item';
        if (state.selectedId === item.id) {
            div.classList.add('selected');
        }

        const posterUrl = item.poster_path 
            ? (item.poster_path.startsWith('http') ? item.poster_path : `https://image.tmdb.org/t/p/w92${item.poster_path}`) 
            : '';

        div.innerHTML = `
            <div class="result-poster" style="background-image: url('${posterUrl || '/static/placeholder-poster.png'}')"></div>
            <div class="result-info">
                <div class="result-title">${item.title || item.name}</div>
                <div class="result-year">${item.release_date || item.first_air_date || 'Año desconocido'}</div>
            </div>
        `;

        div.addEventListener('click', () => {
            // Quitar clase seleccionada a los demás
            document.querySelectorAll('.result-item').forEach(el => el.classList.remove('selected'));
            div.classList.add('selected');
            
            // Actualizar estado de selección
            state.selectedId = item.id;
            state.selectedTitle = item.title || item.name;
            state.selectedYear = (item.release_date || item.first_air_date || '----').substring(0, 4);
            state.selectedPoster = posterUrl;
            
            // Mostrar tarjeta de selección activa
            updateSelectionCard();
            validateButtons();
            setStatus(`Seleccionado: ${state.selectedTitle} (ID: ${state.selectedId})`);
        });

        dom.searchResults.appendChild(div);
    });
}

// Actualiza la tarjeta que muestra la película/serie seleccionada activa
function updateSelectionCard() {
    dom.selectedPoster.style.backgroundImage = `url('${state.selectedPoster || '/static/placeholder-poster.png'}')`;
    dom.selectedBadge.textContent = state.mediaType === 'tv' ? 'Serie' : 'Película';
    dom.selectedTitle.textContent = state.selectedTitle;
    dom.selectedMeta.textContent = `${state.selectedYear} • ID: ${state.selectedId}`;
    dom.selectionCard.style.display = 'flex';
}

// 2. Seleccionar archivos locales (abre selector nativo del SO en backend)
async function selectFiles() {
    setStatus('Abriendo ventana de selección de archivos...');
    try {
        const response = await fetch('/api/seleccionar');
        const data = await response.json();

        if (data.status === 'success' && data.files && data.files.length > 0) {
            // Eliminar del estado los archivos que ya fueron renombrados exitosamente
            const pathsRenamed = new Set(state.plan.filter(p => p.renamed).map(p => p.ruta_original));
            if (pathsRenamed.size > 0) {
                state.files = state.files.filter(f => !pathsRenamed.has(f));
                state.plan = state.plan.filter(p => !pathsRenamed.has(p.ruta_original));
                pathsRenamed.forEach(path => state.unchecked.delete(path));
            }

            // Unir archivos nuevos evitando duplicados
            const uniqueFiles = [...state.files];
            let addedCount = 0;
            
            data.files.forEach(file => {
                if (!uniqueFiles.includes(file)) {
                    uniqueFiles.push(file);
                    addedCount++;
                }
            });

            if (addedCount > 0) {
                state.files = uniqueFiles;
                // Reiniciar el plan para obligar a un re-análisis consistente de la nueva lista
                state.plan = [];
                
                renderFilesTable();
                setStatus(`Se agregaron ${addedCount} archivos nuevos. Total: ${state.files.length} archivos.`);
                showToast(`Se agregaron ${addedCount} archivos nuevos con éxito.`, 'success');
                validateButtons();
            } else {
                setStatus('Todos los archivos seleccionados ya se encontraban cargados.');
                showToast('Todos los archivos seleccionados ya se encontraban cargados.', 'info');
            }
        } else {
            setStatus('Selección de archivos cancelada o vacía.');
        }
    } catch (err) {
        console.error(err);
        setStatus('Error al abrir el selector de archivos nativo.');
        showToast('Error al abrir el selector de archivos nativo.', 'error');
    }
}

// Dibuja la tabla de archivos
function renderFilesTable() {
    dom.filesBody.innerHTML = '';
    
    const tableEl = document.getElementById('files-table');
    const noFilesEl = document.getElementById('no-files-container');
    
    if (state.files.length === 0) {
        tableEl.style.display = 'none';
        noFilesEl.style.display = 'flex';
        dom.filesCount.textContent = '0 archivos cargados';
        return;
    }
    
    tableEl.style.display = 'table';
    noFilesEl.style.display = 'none';

    const totalCount = state.files.length;
    const renamedCount = state.plan.filter(p => p.renamed).length;
    if (renamedCount > 0) {
        dom.filesCount.textContent = `${totalCount} archivos cargados (${renamedCount} renombrados)`;
    } else {
        dom.filesCount.textContent = `${totalCount} archivos cargados`;
    }

    state.files.forEach(filepath => {
        const filename = getBasename(filepath);
        
        // Buscar si este archivo ya tiene un resultado en el plan actual
        const planItem = state.plan.find(p => p.ruta_original === filepath);
        
        let nuevoNombreHTML = '';
        let estadoHTML = '';
        let rowClass = '';
        let isRenamed = false;
        let hasRenameError = false;
        let renameErrorMsg = '';
        
        if (planItem) {
            isRenamed = !!planItem.renamed;
            hasRenameError = !!planItem.rename_error;
            renameErrorMsg = planItem.rename_error || '';
        }
        
        if (isRenamed) {
            rowClass = 'row-renamed';
            nuevoNombreHTML = `<span class="proposed-name success">${planItem.nombre_nuevo}</span>`;
            estadoHTML = '<span class="status-badge renamed" title="Renombrado exitosamente"><i class="fa-solid fa-circle-check"></i></span>';
        } else if (hasRenameError) {
            rowClass = 'row-error';
            nuevoNombreHTML = `<span class="proposed-name error">${planItem.nombre_nuevo || 'Error'}</span>`;
            estadoHTML = `<span class="status-badge rename-error" title="Error al renombrar: ${renameErrorMsg.replace(/"/g, '&quot;')}"><i class="fa-solid fa-circle-exclamation"></i></span>`;
        } else if (!planItem) {
            nuevoNombreHTML = '<span class="proposed-name pending">Pendiente de análisis...</span>';
            estadoHTML = '<span class="status-badge pending"><i class="fa-regular fa-clock"></i></span>';
        } else if (planItem.nombre_nuevo) {
            nuevoNombreHTML = `<span class="proposed-name">${planItem.nombre_nuevo}</span>`;
            estadoHTML = '<span class="status-badge success"><i class="fa-solid fa-check"></i></span>';
        } else {
            nuevoNombreHTML = '<span class="proposed-name error">No se pudo identificar (¿Formato de serie incorrecto?)</span>';
            estadoHTML = '<span class="status-badge error"><i class="fa-solid fa-xmark"></i></span>';
        }

        const isChecked = !state.unchecked.has(filepath);
        const tr = document.createElement('tr');
        if (rowClass) {
            tr.className = rowClass;
        }

        const checkboxDisabledAttr = isRenamed ? 'disabled' : '';
        const checkboxCheckedAttr = (isChecked || isRenamed) ? 'checked' : '';

        tr.innerHTML = `
            <td class="text-center">
                <label class="custom-checkbox-container">
                    <input type="checkbox" class="file-checkbox" data-filepath="${filepath}" ${checkboxCheckedAttr} ${checkboxDisabledAttr}>
                    <span class="custom-checkbox"></span>
                </label>
            </td>
            <td><span class="original-name ${isRenamed ? 'renamed' : ''}">${filename}</span></td>
            <td>${nuevoNombreHTML}</td>
            <td class="text-center">${estadoHTML}</td>
            <td class="text-center">
                <button class="btn-delete" title="Eliminar de la lista" ${isRenamed ? 'style="display: none;"' : ''}>
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        
        // Manejador del checkbox individual
        const chk = tr.querySelector('.file-checkbox');
        if (!isRenamed) {
            chk.addEventListener('change', (e) => {
                if (e.target.checked) {
                    state.unchecked.delete(filepath);
                } else {
                    state.unchecked.add(filepath);
                }
                updateSelectAllCheckbox();
                validateButtons();
            });

            // Agregar manejador de eventos para el botón de eliminar
            tr.querySelector('.btn-delete').addEventListener('click', () => {
                removeFile(filepath);
            });
        }

        dom.filesBody.appendChild(tr);
    });

    updateSelectAllCheckbox();
}

// Elimina un archivo de la selección activa
function removeFile(filepath) {
    state.files = state.files.filter(f => f !== filepath);
    state.plan = state.plan.filter(p => p.ruta_original !== filepath);
    state.unchecked.delete(filepath);
    
    renderFilesTable();
    dom.filesCount.textContent = `${state.files.length} archivos cargados`;
    validateButtons();
    setStatus(`Archivo quitado: ${getBasename(filepath)}`);
}

// 3. Analizar nombres y generar propuestas con TMDB
async function analyzeFiles() {
    if (!state.selectedId || state.files.length === 0) return;

    // Filtrar solo los archivos que están marcados (seleccionados)
    const checkedFiles = state.files.filter(f => !state.unchecked.has(f));

    if (checkedFiles.length === 0) {
        showToast('No hay archivos seleccionados para analizar. Por favor, marca al menos uno.', 'warning');
        return;
    }

    showLoader(`Analizando archivos con ${state.provider === 'filmaffinity' ? 'FilmAffinity' : 'TMDB'}...`);
    setStatus(`Consultando información en la API de ${state.provider === 'filmaffinity' ? 'FilmAffinity' : 'TMDB'}...`);

    try {
        const response = await fetch('/api/analizar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tmdb_id: state.selectedId,
                tipo: state.mediaType,
                archivos: checkedFiles,
                idioma: state.language,
                proveedor: state.provider
            })
        });
        const data = await response.json();

        if (data.status === 'success') {
            // Combinar las nuevas propuestas con el plan existente
            const planMap = new Map(state.plan.map(p => [p.ruta_original, p]));
            data.plan.forEach(newItem => {
                planMap.set(newItem.ruta_original, newItem);
            });
            state.plan = Array.from(planMap.values());

            renderFilesTable();
            setStatus('Análisis completado. Revisa las propuestas de nombres antes de ejecutar.');
            showToast('Análisis completado con éxito.', 'success');
            validateButtons();
        } else {
            setStatus(`Error en análisis: ${data.message}`);
            showToast(`Error en análisis: ${data.message}`, 'error');
        }
    } catch (err) {
        console.error(err);
        setStatus('Error de conexión al analizar los archivos.');
        showToast('Error de conexión al analizar los archivos.', 'error');
    } finally {
        hideLoader();
    }
}

// 4. Ejecutar el renombrado en disco
async function executeRename() {
    if (!state.plan || state.plan.length === 0) return;

    // Filtrar solo los archivos que tienen una propuesta válida de cambio de nombre Y no están desmarcados Y no han sido renombrados aún
    const archivosARenombrar = state.plan.filter(p => p.nombre_nuevo && !state.unchecked.has(p.ruta_original) && !p.renamed);

    if (archivosARenombrar.length === 0) {
        showToast('No hay archivos válidos seleccionados para renombrar.', 'warning');
        return;
    }

    const confirmar = await customConfirm(
        `¿Estás seguro de que deseas renombrar los ${archivosARenombrar.length} archivos seleccionados?`,
        'Confirmar Renombrado'
    );
    if (!confirmar) return;

    showLoader('Renombrando archivos...');
    setStatus('Cambiando nombres en el disco duro...');

    try {
        const response = await fetch('/api/renombrar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan: archivosARenombrar })
        });
        const data = await response.json();

        if (data.status === 'success') {
            if (data.exitos === archivosARenombrar.length) {
                showToast(`Todos los ${data.exitos} archivos se renombraron con éxito.`, 'success');
            } else if (data.exitos > 0) {
                showToast(`Proceso finalizado. Se renombraron con éxito ${data.exitos} de ${archivosARenombrar.length} archivos.`, 'warning');
            } else {
                showToast('No se pudo renombrar ningún archivo.', 'error');
            }
            setStatus(`Finalizado: ${data.exitos} archivos renombrados con éxito.`);
            
            // Actualizar el estado del plan y unchecked según los resultados detallados
            if (data.resultados && data.resultados.length > 0) {
                data.resultados.forEach(res => {
                    const planItem = state.plan.find(p => p.ruta_original === res.ruta_original);
                    if (planItem) {
                        if (res.status === 'success') {
                            planItem.renamed = true;
                            delete planItem.rename_error;
                            state.unchecked.delete(res.ruta_original);
                        } else {
                            planItem.renamed = false;
                            planItem.rename_error = res.error || 'Error desconocido';
                        }
                    }
                });
            } else {
                // Fallback por si la respuesta del servidor no tiene resultados individuales
                archivosARenombrar.forEach(a => {
                    const planItem = state.plan.find(p => p.ruta_original === a.ruta_original);
                    if (planItem) {
                        planItem.renamed = true;
                        state.unchecked.delete(a.ruta_original);
                    }
                });
            }
            
            renderFilesTable();
            validateButtons();
        } else {
            setStatus(`Error en renombrado: ${data.message}`);
            showToast(`Error en renombrado: ${data.message}`, 'error');
        }
    } catch (err) {
        console.error(err);
        setStatus('Error de conexión al ejecutar el renombrado.');
        showToast('Error de conexión al ejecutar el renombrado.', 'error');
    } finally {
        hideLoader();
    }
}

// Actualiza el estado del checkbox de seleccionar todo en el encabezado
function updateSelectAllCheckbox() {
    const selectAllChk = document.getElementById('chk-select-all');
    if (!selectAllChk) return;
    
    // Ignorar archivos ya renombrados exitosamente
    const activeFiles = state.files.filter(f => {
        const planItem = state.plan.find(p => p.ruta_original === f);
        return !(planItem && planItem.renamed);
    });
    
    if (activeFiles.length === 0) {
        selectAllChk.checked = false;
        selectAllChk.disabled = true;
        return;
    }
    
    selectAllChk.disabled = false;
    const allChecked = activeFiles.every(filepath => !state.unchecked.has(filepath));
    selectAllChk.checked = allChecked;
}

// Muestra una notificación de tipo Toast en pantalla
function showToast(message, type = 'info', duration = 4500) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-item ${type}`;
    
    // Asignar el icono correspondiente
    let iconHTML = '';
    if (type === 'success') {
        iconHTML = '<i class="fa-solid fa-circle-check"></i>';
    } else if (type === 'error') {
        iconHTML = '<i class="fa-solid fa-circle-xmark"></i>';
    } else if (type === 'warning') {
        iconHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
    } else {
        iconHTML = '<i class="fa-solid fa-circle-info"></i>'; // info
    }

    toast.innerHTML = `
        <div class="toast-icon">${iconHTML}</div>
        <div class="toast-message">${message}</div>
        <button class="toast-close" title="Cerrar"><i class="fa-solid fa-xmark"></i></button>
        <div class="toast-progress" style="animation-duration: ${duration}ms"></div>
    `;

    // Cerrar botón
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => removeToast(toast));

    container.appendChild(toast);

    // Activar animación de entrada en el siguiente frame
    requestAnimationFrame(() => {
        toast.classList.add('active');
    });

    // Auto-destrucción con timer
    const timer = setTimeout(() => {
        removeToast(toast);
    }, duration);

    function removeToast(el) {
        clearTimeout(timer);
        el.classList.add('fade-out');
        el.addEventListener('transitionend', () => {
            el.remove();
        });
    }
}

// Muestra un modal de confirmación asincrónico personalizado
function customConfirm(message, title = '¿Estás seguro?') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const modalTitle = document.getElementById('confirm-modal-title');
        const modalMessage = document.getElementById('confirm-modal-message');
        const btnCancel = document.getElementById('btn-confirm-cancel');
        const btnAccept = document.getElementById('btn-confirm-accept');
        
        if (!modal || !modalTitle || !modalMessage || !btnCancel || !btnAccept) {
            // Fallback si no está cargado el DOM aún
            resolve(confirm(message));
            return;
        }

        modalTitle.textContent = title;
        modalMessage.textContent = message;
        
        modal.classList.add('active');
        
        const cleanup = (value) => {
            modal.classList.remove('active');
            btnCancel.removeEventListener('click', onCancel);
            btnAccept.removeEventListener('click', onAccept);
            resolve(value);
        };
        
        function onCancel() {
            cleanup(false);
        }
        
        function onAccept() {
            cleanup(true);
        }
        
        btnCancel.addEventListener('click', onCancel);
        btnAccept.addEventListener('click', onAccept);
    });
}

// ==========================================================================
// LÓGICA DEL LIMPIADOR MKV
// ==========================================================================
const stateCleaner = {
    files: [],
    datosAnalisis: {}
};

// 1. Agregar logs a la consola de la terminal
function addCleanerLog(message, type = 'info') {
    if (!dom.consoleLogs) return;
    
    const logLine = document.createElement('div');
    logLine.className = `log-line log-${type.toLowerCase()}`;
    
    // Obtener la hora actual formateada
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    
    logLine.textContent = `[${timeStr}] ${message}`;
    
    dom.consoleLogs.appendChild(logLine);
    // Auto-scroll al fondo de la consola
    dom.consoleLogs.scrollTop = dom.consoleLogs.scrollHeight;
}

// 2. Seleccionar archivos/carpetas en el limpiador
async function selectCleanerFiles(tipo) {
    try {
        addCleanerLog(tipo === 'files' ? 'Abriendo selector de archivos...' : 'Abriendo selector de carpeta...', 'system');
        const response = await fetch(`/api/limpiador/seleccionar?tipo=${tipo}`);
        const data = await response.json();
        
        if (data.status === 'success' && data.files && data.files.length > 0) {
            stateCleaner.files = data.files;
            stateCleaner.datosAnalisis = {}; // Resetear análisis previo
            
            // Renderizar la lista lateral de archivos
            renderCleanerFiles();
            
            // Limpiar logs y mostrar mensaje en consola
            dom.consoleLogs.innerHTML = '';
            addCleanerLog(`${stateCleaner.files.length} archivo(s) cargado(s). Listo para analizar.`, 'load');
            
            // Habilitar / deshabilitar botones
            validateCleanerButtons();
            showToast(`${stateCleaner.files.length} archivo(s) cargado(s) correctamente.`, 'success');
        } else if (data.status === 'success') {
            addCleanerLog('Selección de archivos cancelada.', 'system');
        } else if (data.status === 'error') {
            showToast(`Error al seleccionar: ${data.message}`, 'error');
            addCleanerLog(`Error: ${data.message}`, 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Error de red al seleccionar archivos.', 'error');
        addCleanerLog('Error de red al conectar con el servidor.', 'error');
    }
}

// 3. Renderiza la lista lateral de archivos cargados en el limpiador
function renderCleanerFiles() {
    if (!dom.cleanerFilesList || !dom.cleanerFilesCard) return;
    
    dom.cleanerFilesList.innerHTML = '';
    
    if (stateCleaner.files.length > 0) {
        dom.cleanerFilesCard.style.display = 'flex';
        dom.cleanerFilesCount.textContent = `${stateCleaner.files.length} archivo(s) cargado(s)`;
        
        stateCleaner.files.forEach((filepath, index) => {
            const item = document.createElement('div');
            item.className = 'cleaner-file-item';
            item.title = filepath;
            
            const filename = getBasename(filepath);
            item.innerHTML = `
                <i class="fa-solid fa-file-video" style="margin-right: 4px;"></i>
                <span style="flex-grow: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 8px;">${filename}</span>
                <button class="btn-delete btn-cleaner-file-delete" data-index="${index}" title="Quitar archivo" style="padding: 4px; font-size: 0.85rem;">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            `;
            dom.cleanerFilesList.appendChild(item);
        });

        // Vincular los eventos de los botones eliminar
        const deleteBtns = dom.cleanerFilesList.querySelectorAll('.btn-cleaner-file-delete');
        deleteBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.getAttribute('data-index'), 10);
                removeCleanerFile(index);
            });
        });
    } else {
        dom.cleanerFilesList.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-photo-film"></i>
                <p>Selecciona archivos de video o una carpeta arriba para comenzar la limpieza de metadatos</p>
            </div>
        `;
        dom.cleanerFilesCount.textContent = '0 archivos cargados';
    }
}

// Función para remover un archivo específico del limpiador
function removeCleanerFile(index) {
    if (index >= 0 && index < stateCleaner.files.length) {
        const removedFile = stateCleaner.files[index];
        stateCleaner.files.splice(index, 1);
        
        // Quitar del análisis si ya estaba analizado
        if (stateCleaner.datosAnalisis && stateCleaner.datosAnalisis[removedFile]) {
            delete stateCleaner.datosAnalisis[removedFile];
        }
        
        renderCleanerFiles();
        validateCleanerButtons();
        
        addCleanerLog(`Se quitó de la lista: ${getBasename(removedFile)}`, 'system');
        showToast(`Archivo quitado: ${getBasename(removedFile)}`, 'info');
    }
}

// 4. Validar habilitación de botones de limpiador
function validateCleanerButtons() {
    const hasFiles = stateCleaner.files.length > 0;
    const hasAnalysis = Object.keys(stateCleaner.datosAnalisis).length > 0;
    
    if (dom.btnCleanerAnalyze) dom.btnCleanerAnalyze.disabled = !hasFiles;
    if (dom.btnCleanerProcess) dom.btnCleanerProcess.disabled = !hasAnalysis;
    
    if (dom.btnCleanerReset) {
        dom.btnCleanerReset.style.display = hasFiles ? 'inline-flex' : 'none';
    }
}

// 5. Analizar pistas de los archivos MKV cargados
async function analyzeCleanerFiles() {
    if (stateCleaner.files.length === 0) return;
    
    // Deshabilitar botones durante el análisis
    if (dom.btnCleanerAnalyze) dom.btnCleanerAnalyze.disabled = true;
    if (dom.btnCleanerProcess) dom.btnCleanerProcess.disabled = true;
    
    dom.consoleLogs.innerHTML = '';
    addCleanerLog('Analizando pistas de video, por favor espera...', 'system');
    
    try {
        const response = await fetch('/api/limpiador/analizar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ archivos: stateCleaner.files })
        });
        const data = await response.json();
        
        if (data.status === 'success') {
            stateCleaner.datosAnalisis = data.datos_analisis;
            
            // Imprimir logs devueltos por el backend
            if (data.logs && data.logs.length > 0) {
                data.logs.forEach(log => {
                    addCleanerLog(log.mensaje, log.tipo);
                });
            }
            
            showToast('Análisis completado. Listo para procesar.', 'success');
        } else {
            showToast(data.message || 'Error analizando archivos.', 'error');
            addCleanerLog(data.message || 'Error analizando archivos.', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Error de red al analizar pistas.', 'error');
        addCleanerLog('Error de red al analizar pistas.', 'error');
    } finally {
        validateCleanerButtons();
    }
}

// 6. Ejecutar limpieza de metadatos (mkvpropedit)
async function processCleanerFiles() {
    if (Object.keys(stateCleaner.datosAnalisis).length === 0) return;
    
    // Preguntar confirmación antes de iniciar
    const confirmed = await customConfirm(
        'Se modificarán las propiedades internas de los archivos (Título y nombres de pistas). ¿Deseas iniciar el proceso?',
        '¿Iniciar Limpieza de Metadatos?'
    );
    if (!confirmed) return;
    
    // Deshabilitar botones durante el proceso
    if (dom.btnCleanerAnalyze) dom.btnCleanerAnalyze.disabled = true;
    if (dom.btnCleanerProcess) dom.btnCleanerProcess.disabled = true;
    
    addCleanerLog('Procesando metadatos, por favor espera...', 'system');
    
    try {
        const response = await fetch('/api/limpiador/procesar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ datos_analisis: stateCleaner.datosAnalisis })
        });
        const data = await response.json();
        
        if (data.status === 'success') {
            // Imprimir logs devueltos por el backend
            if (data.logs && data.logs.length > 0) {
                data.logs.forEach(log => {
                    addCleanerLog(log.mensaje, log.tipo);
                });
            }
            
            showToast(`Limpieza de metadatos completada. ${data.exitos} archivo(s) modificado(s).`, 'success');
            
            // Limpiar estado
            stateCleaner.files = [];
            stateCleaner.datosAnalisis = {};
            renderCleanerFiles();
        } else {
            showToast(data.message || 'Error procesando archivos.', 'error');
            addCleanerLog(data.message || 'Error procesando archivos.', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Error de red al procesar metadatos.', 'error');
        addCleanerLog('Error de red al procesar metadatos.', 'error');
    } finally {
        validateCleanerButtons();
    }
}

// 7. Limpiar la consola de logs
function clearCleanerLogs() {
    if (dom.consoleLogs) {
        dom.consoleLogs.innerHTML = '<div class="log-line log-system">[SISTEMA] Listo. Carga archivos MKV o MP4 para iniciar el análisis profesional.</div>';
    }
}

// 8. Reiniciar todo en el limpiador
function resetCleanerAll() {
    stateCleaner.files = [];
    stateCleaner.datosAnalisis = {};
    
    renderCleanerFiles();
    clearCleanerLogs();
    validateCleanerButtons();
    showToast('Limpiador reiniciado.', 'info');
}
