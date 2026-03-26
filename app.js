/* ══════════════════════════════════════════════════════════════
   DCM — Data Center Cabling Management
   Application Logic
   ══════════════════════════════════════════════════════════════ */

class CablingApp {
  constructor() {
    this.data = [];
    this.filteredData = [];
    this.importBuffer = [];
    this.columnMap = {};
    this.sortColumn = null;
    this.sortAsc = true;
    this.currentPage = 1;
    this.pageSize = 25;
    this.searchQuery = '';
    this.clientFilter = '';
    this.charts = {};
    this.recentEntries = [];
    this.routeSortColumn = 'patchpanel';
    this.routeSortAsc = true;

    // Supabase Client
    this.supabase = null;
    this.session = null;
    this.authMode = 'login';

    if (typeof supabase !== 'undefined' && SUPABASE_CONFIG.url !== 'TU_SUPABASE_URL') {
      this.supabase = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    }

    this.FIELDS = [
      { key: 'fecha', label: 'Fecha' },
      { key: 'cdno', label: 'Pedido/Proyecto' },
      { key: 'patchpanel', label: 'Patch Panel' },
      { key: 'puerto', label: '# Puerto' },
      { key: 'cliente', label: 'Cliente' },
      { key: 'origen', label: 'Origen' },
      { key: 'destino', label: 'Destino' },
      { key: 'observaciones', label: 'Observaciones' },
      { key: 'ruta', label: 'Ruta' },
    ];

    // Known column name mappings (Spanish spreadsheet headers)
    this.COLUMN_ALIASES = {
      fecha: ['fecha', 'date', 'fch'],
      cdno: ['cdno', '# cdno', '#cdno', 'conector', 'connector', 'cable', 'pedido', 'proyecto', 'proy'],
      patchpanel: ['patch panel', 'ident. # patch panel', 'ident. #patch panel', 'patchpanel', 'panel', 'ident'],
      puerto: ['puerto', '# puer', '#puer', '# puerto', '#puerto', 'port', 'puer'],
      cliente: ['cliente', 'client', 'customer'],
      origen: ['origen', 'origin', 'source', 'desde'],
      destino: ['destino', 'destination', 'dest', 'carrier', 'hacia'],
      observaciones: ['observaciones', 'observations', 'obs', 'notas', 'notes', 'comentarios'],
      ruta: ['ruta', 'route', 'path', 'trayecto'],
    };

    this.CHART_COLORS = [
      '#38bdf8', '#a78bfa', '#34d399', '#fb923c', '#f87171',
      '#22d3ee', '#fbbf24', '#e879f9', '#4ade80', '#f472b6',
      '#60a5fa', '#c084fc', '#2dd4bf', '#facc15', '#818cf8',
    ];

    this._init();
  }

  // ── Initialization ─────────────────────────────────────────

  async _init() {
    this._setupTabs();
    this._setupForm();
    if (typeof Papa !== 'undefined' || typeof XLSX !== 'undefined') {
      this._setupImport();
    }
    this._setupSearch();
    this._setupSort();
    this._setupRouteSort();
    this._setupClientFilter();
    if (typeof Chart !== 'undefined') {
      this._initCharts();
    } else {
      console.warn('Chart.js no está accesible. Las gráficas no se mostrarán.');
    }

    if (this.supabase) {
      await this._initAuth();
    } else {
      await this._loadData();
      this._updateDataLists();
      this._applyFilters();
    }
    this._setDefaultDate();
  }

  async _initAuth() {
    // Check initial session
    const { data: { session } } = await this.supabase.auth.getSession();
    this._handleAuthState(session);

    // Listen for changes
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this._handleAuthState(session);
    });

    // Auth Form handlers
    document.getElementById('authForm').onsubmit = (e) => this._onAuthSubmit(e);
    document.getElementById('authToggleBtn').onclick = (e) => {
      e.preventDefault();
      this._toggleAuthMode();
    };
    document.getElementById('logoutBtn').onclick = () => this.supabase.auth.signOut();
  }

  _handleAuthState(session) {
    this.session = session;
    const authContainer = document.getElementById('authContainer');
    const appContainer = document.getElementById('appContainer');

    if (session) {
      if (authContainer) authContainer.classList.add('hidden');
      if (appContainer) appContainer.classList.remove('hidden');
      document.getElementById('displayEmail').textContent = session.user.email;
      document.getElementById('userAvatar').textContent = session.user.email[0].toUpperCase();
      this._loadData().then(() => {
        this._updateDataLists();
        this._applyFilters();
      });
    } else {
      if (authContainer) authContainer.classList.remove('hidden');
      if (appContainer) appContainer.classList.add('hidden');
      this.data = [];
      this._updateDataLists();
      this._applyFilters();
    }
  }

  async _onAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const btn = document.getElementById('authSubmitBtn');
    
    btn.disabled = true;
    btn.textContent = this.authMode === 'login' ? 'Ingresando...' : 'Registrando...';

    try {
      let result;
      if (this.authMode === 'login') {
        result = await this.supabase.auth.signInWithPassword({ email, password });
      } else {
        result = await this.supabase.auth.signUp({ email, password });
      }

      if (result.error) throw result.error;
      
      if (this.authMode === 'signup') {
        this._toast('Registro exitoso. Revisa tu correo o intenta ingresar.', 'success');
        this._toggleAuthMode();
      }
    } catch (err) {
      this._toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = this.authMode === 'login' ? 'Ingresar' : 'Registrarse';
    }
  }

  _toggleAuthMode() {
    this.authMode = this.authMode === 'login' ? 'signup' : 'login';
    const title = document.querySelector('.auth-title');
    const subtitle = document.getElementById('authSubtitle');
    const btn = document.getElementById('authSubmitBtn');
    const toggleText = document.getElementById('authToggleText');
    const toggleBtn = document.getElementById('authToggleBtn');

    if (this.authMode === 'login') {
      title.textContent = 'DCM Cloud';
      subtitle.textContent = 'Inicia sesión para acceder a tus datos';
      btn.textContent = 'Ingresar';
      toggleText.textContent = '¿No tienes cuenta?';
      toggleBtn.textContent = 'Regístrate gratis';
    } else {
      title.textContent = 'Nueva Cuenta';
      subtitle.textContent = 'Crea tu perfil para guardar tus conexiones';
      btn.textContent = 'Registrarse';
      toggleText.textContent = '¿Ya tienes cuenta?';
      toggleBtn.textContent = 'Inicia sesión';
    }
  }

  _setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('inputFecha').value = today;
  }

  // ── Local Storage ──────────────────────────────────────────

  async _loadData() {
    try {
      // 1. Try to load from Supabase if configured
      if (this.supabase && this.session) {
        const { data, error } = await this.supabase
          .from('cabling_data')
          .select('*')
          .order('id', { ascending: false });
        
        if (!error && data && data.length > 0) {
          this.data = data;
          console.log('[DB] Datos cargados desde Supabase (' + data.length + ' registros)');
          localStorage.setItem('dcm_cabling_data', JSON.stringify(this.data));
          return;
        } else if (!error && data && data.length === 0) {
          console.log('[DB] Supabase está vacío, intentando cargar desde LocalStorage');
        } else if (error) {
          console.error('[DB] Error cargando desde Supabase:', error.message);
        }
      }

      // 2. Fallback to Local Storage
      const saved = localStorage.getItem('dcm_cabling_data');
      this.data = saved ? JSON.parse(saved) : [];
      console.log('[DB] Datos cargados desde LocalStorage');
    } catch (err) {
      console.error('[DB] Fallo critico en carga:', err);
      this.data = [];
    }
  }

  async _saveData(singleEntry = null) {
    // Update local cache first
    localStorage.setItem('dcm_cabling_data', JSON.stringify(this.data));

    if (!this.supabase) return;

    const sanitize = (obj) => {
      const s = { ...obj };
      // Inject user_id ONLY if it doesn't have one (preserve original creator)
      if (this.session && !s.user_id) {
        s.user_id = this.session.user.id;
      }
      for (let k in s) if (s[k] === '') s[k] = null;
      
      // Fix potentially corrupt dates (e.g. "+046063-01-01")
      if (s.fecha && typeof s.fecha === 'string') {
        const parts = s.fecha.match(/(\d{4,6})-(\d{2})-(\d{2})/);
        if (parts) {
          let year = parseInt(parts[1], 10);
          if (year > 2100) year = new Date().getFullYear();
          if (year < 1900) year = 1900;
          s.fecha = `${year}-${parts[2]}-${parts[3]}`;
        } else {
          s.fecha = null; // Invalid format
        }
      }
      
      // Remove DB-controlled fields to prevent out-of-range timestamp errors
      delete s.created_at;
      
      return s;
    };

    try {
      if (singleEntry) {
        // Upsert single entry
        const { error } = await this.supabase
          .from('cabling_data')
          .upsert([sanitize(singleEntry)]);
        if (error) throw error;
      } else {
        // Full sync
        const { error } = await this.supabase
          .from('cabling_data')
          .upsert(this.data.map(sanitize));
        if (error) throw error;
      }
    } catch (err) {
      console.error('[DB] Error guardando en Supabase:', err);
      const msg = err.message || (err.error ? err.error.message : 'Error desconocido');
      this._toast('Error al sincronizar con la nube: ' + msg, 'error');
    }
  }

  async _deleteFromDb(id) {
    if (!this.supabase) return;
    try {
      const { data, error } = await this.supabase
        .from('cabling_data')
        .delete()
        .eq('id', id)
        .select();
        
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("No se pudo eliminar en la nube. Verifica los permisos de Supabase (RLS).");
      }
    } catch (err) {
      console.error('[DB] Error eliminando en Supabase:', err.message);
      this._toast('No se pudo borrar remotamente: ' + err.message, 'warning');
      // Restore the record by fetching from DB to stay in sync
      this._loadData();
    }
  }

  // ── Tab Navigation ─────────────────────────────────────────

  _setupTabs() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        // update active tab
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        // update panels
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        const panel = document.getElementById('panel' + target.charAt(0).toUpperCase() + target.slice(1));
        if (panel) panel.classList.add('active');
      });
    });
  }

  // ── Entry Form ─────────────────────────────────────────────

  _setupForm() {
    document.getElementById('entryForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this._addEntry();
    });
  }

  _addEntry() {
    const entry = {
      id: this._genId(),
      fecha: document.getElementById('inputFecha').value,
      cdno: document.getElementById('inputCdno').value.trim(),
      patchpanel: document.getElementById('inputPatchPanel').value.trim(),
      puerto: parseInt(document.getElementById('inputPuerto').value) || null,
      cliente: document.getElementById('inputCliente').value.trim().toUpperCase(),
      origen: document.getElementById('inputOrigen').value.trim(),
      destino: document.getElementById('inputDestino').value.trim(),
      observaciones: document.getElementById('inputObservaciones').value.trim(),
      ruta: document.getElementById('inputRuta').value.trim(),
    };

    if (!entry.cliente) {
      this._toast('Debe ingresar un cliente', 'warning');
      return;
    }

    this.data.push(entry);
    this._saveData(entry);
    this.recentEntries.unshift(entry);
    if (this.recentEntries.length > 10) this.recentEntries.pop();

    this._updateRecentTable();
    this._applyFilters();
    this._updateDataLists();

    // clear form except date
    const fecha = document.getElementById('inputFecha').value;
    document.getElementById('entryForm').reset();
    document.getElementById('inputFecha').value = fecha;
    document.getElementById('inputCdno').focus();

    this._toast('Conexión agregada correctamente', 'success');
  }

  clearForm() {
    document.getElementById('entryForm').reset();
    this._setDefaultDate();
    document.getElementById('inputCdno').focus();
  }

  _updateRecentTable() {
    const tbody = document.getElementById('recentBody');
    tbody.innerHTML = this.recentEntries.map(e => `
      <tr>
        <td>${this._fmtDate(e.fecha)}</td>
        <td>${this._esc(e.patchPanel)}</td>
        <td>${this._esc(e.puerto)}</td>
        <td>${this._esc(e.cliente)}</td>
        <td>${this._esc(e.destino)}</td>
      </tr>
    `).join('');
  }

  // ── Data Lists (autocomplete) ──────────────────────────────

  _updateDataLists() {
    const unique = (key) => [...new Set(this.data.map(d => d[key]).filter(Boolean))].sort();

    this._fillDatalist('listPatchPanel', unique('patchpanel'));
    this._fillDatalist('listCliente', unique('cliente'));
    this._fillDatalist('listOrigen', unique('origen'));
    this._fillDatalist('listDestino', unique('destino'));
  }

  _fillDatalist(id, values) {
    const dl = document.getElementById(id);
    if (dl) dl.innerHTML = values.map(v => `<option value="${this._esc(v)}">`).join('');
  }

  // ── Import ─────────────────────────────────────────────────

  _setupImport() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) this._processFile(file);
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this._processFile(file);
      fileInput.value = '';
    });
  }

  _processFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'csv') {
      if (typeof Papa === 'undefined') {
        this._toast('Error: La librería para procesar CSV no está cargada. Verifica tu conexión a internet.', 'error');
        return;
      }
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        encoding: 'UTF-8',
        complete: (results) => {
          if (results.data.length === 0) {
            this._toast('El archivo CSV está vacío', 'error');
            return;
          }
          this._showImportPreview(results.data, results.meta.fields);
        },
        error: (err) => {
          this._toast('Error al leer CSV: ' + err.message, 'error');
        }
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      if (typeof XLSX === 'undefined') {
        this._toast('Error: La librería para procesar Excel no está cargada. Verifica tu conexión a internet.', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const workbook = XLSX.read(e.target.result, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

          if (jsonData.length === 0) {
            this._toast('La hoja de cálculo está vacía', 'error');
            return;
          }

          const headers = Object.keys(jsonData[0]);
          this._showImportPreview(jsonData, headers);
        } catch (err) {
          this._toast('Error al leer Excel: ' + err.message, 'error');
        }
      };
      reader.readAsBinaryString(file);
    } else {
      this._toast('Formato no soportado. Use CSV o Excel.', 'warning');
    }
  }

  _showImportPreview(rawData, headers) {
    this.importBuffer = rawData;
    const preview = document.getElementById('importPreview');
    preview.classList.remove('hidden');

    // Auto-map columns
    this.columnMap = {};
    this.FIELDS.forEach(field => {
      const aliases = this.COLUMN_ALIASES[field.key] || [field.key.toLowerCase()];
      const match = headers.find(h => aliases.some(a => h.toLowerCase().trim().includes(a)));
      this.columnMap[field.key] = match || '';
    });

    // Build column mapping UI
    const mapContainer = document.getElementById('columnMapping');
    mapContainer.innerHTML = this.FIELDS.map(field => {
      const opts = headers.map(h => {
        const sel = h === this.columnMap[field.key] ? 'selected' : '';
        return `<option value="${this._esc(h)}" ${sel}>${this._esc(h)}</option>`;
      }).join('');
      return `
        <div class="form-group">
          <label class="form-label">${field.label}</label>
          <select data-map="${field.key}" onchange="app._updateColumnMap()">
            <option value="">— Sin mapear —</option>
            ${opts}
          </select>
        </div>
      `;
    }).join('');

    // Preview table
    const headRow = document.getElementById('previewHead');
    headRow.innerHTML = headers.map(h => `<th>${this._esc(h)}</th>`).join('');

    const body = document.getElementById('previewBody');
    const previewRows = rawData.slice(0, 10);
    body.innerHTML = previewRows.map(row => {
      return '<tr>' + headers.map(h => `<td>${this._esc(String(row[h] || ''))}</td>`).join('') + '</tr>';
    }).join('');

    document.getElementById('importCount').textContent = `${rawData.length} filas detectadas`;
    document.getElementById('importBtnCount').textContent = rawData.length;
  }

  _updateColumnMap() {
    const selects = document.querySelectorAll('#columnMapping select[data-map]');
    selects.forEach(sel => {
      this.columnMap[sel.dataset.map] = sel.value;
    });
  }

  confirmImport() {
    this._updateColumnMap();
    let imported = 0;

    this.importBuffer.forEach(row => {
      const entry = { id: this._genId() };
      this.FIELDS.forEach(field => {
        const srcCol = this.columnMap[field.key];
        let val = srcCol ? String(row[srcCol] || '').trim() : '';
        if (field.key === 'cliente') val = val.toUpperCase();
        if (field.key === 'puerto') val = parseInt(val) || null;
        if (field.key === 'fecha' && val) {
          // Try to parse date
          val = this._parseDate(val);
        }
        entry[field.key] = val;
      });
      if (entry.cliente || entry.patchPanel || entry.destino) {
        this.data.push(entry);
        imported++;
      }
    });

    this._saveData();
    this.importBuffer = [];
    document.getElementById('importPreview').classList.add('hidden');

    this._applyFilters();
    this._updateDataLists();
    this._toast(`${imported} registros importados correctamente`, 'success');

    // Switch to data tab
    document.querySelector('[data-tab="data"]').click();
  }

  cancelImport() {
    this.importBuffer = [];
    document.getElementById('importPreview').classList.add('hidden');
  }

  _parseDate(str) {
    if (!str) return '';
    // If already ISO format
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    // DD/MM/YYYY
    const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
    // Try native parse
    const d = new Date(str);
    if (!isNaN(d)) return d.toISOString().split('T')[0];
    return str;
  }

  // ── Search & Filter ────────────────────────────────────────

  _setupSearch() {
    const input = document.getElementById('tableSearch');
    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        this.searchQuery = input.value.toLowerCase().trim();
        this.currentPage = 1;
        this._applyFilters();
      }, 200);
    });
  }

  _setupClientFilter() {
    const select = document.getElementById('globalClientFilter');
    select.addEventListener('change', () => {
      this.clientFilter = select.value;
      this.currentPage = 1;
      this._applyFilters();
    });
  }

  _applyFilters() {
    let result = [...this.data];

    // Global filter (Client or Carrier)
    if (this.clientFilter) {
      if (this.clientFilter.startsWith('carrier:')) {
        const carrierVal = this.clientFilter.replace('carrier:', '');
        result = result.filter(r => (r.destino || '').trim() === carrierVal);
      } else if (this.clientFilter.startsWith('client:')) {
        const clientVal = this.clientFilter.replace('client:', '');
        result = result.filter(r => r.cliente === clientVal);
      }
    }

    // Search
    if (this.searchQuery) {
      result = result.filter(r => {
        return Object.values(r).some(v => String(v).toLowerCase().includes(this.searchQuery));
      });
    }

    // Sort
    if (this.sortColumn) {
      result.sort((a, b) => {
        let va = (a[this.sortColumn] || '').toString().toLowerCase();
        let vb = (b[this.sortColumn] || '').toString().toLowerCase();
        if (this.sortColumn === 'puerto') {
          va = parseInt(va) || 0;
          vb = parseInt(vb) || 0;
        }
        if (va < vb) return this.sortAsc ? -1 : 1;
        if (va > vb) return this.sortAsc ? 1 : -1;
        return 0;
      });
    }

    this.filteredData = result;
    this._renderTable();
    this._updateKPIs();
    this._updateCharts();
    this._updateClientDropdown();
    this._updateBadge();
    this._renderRouteSummary();
  }

  // ── Sort ───────────────────────────────────────────────────

  _setupSort() {
    document.querySelectorAll('#dataTable th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (this.sortColumn === col) {
          this.sortAsc = !this.sortAsc;
        } else {
          this.sortColumn = col;
          this.sortAsc = true;
        }
        // visual
        document.querySelectorAll('#dataTable th').forEach(t => t.classList.remove('sorted'));
        th.classList.add('sorted');
        th.querySelector('.sort-icon').textContent = this.sortAsc ? '↑' : '↓';
        this._applyFilters();
      });
    });
  }

  _setupRouteSort() {
    document.querySelectorAll('#routeSummaryTable th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (this.routeSortColumn === col) {
          this.routeSortAsc = !this.routeSortAsc;
        } else {
          this.routeSortColumn = col;
          this.routeSortAsc = true;
        }
        this._renderRouteSummary();
      });
    });
  }

  // ── Render Table ───────────────────────────────────────────

  _renderTable() {
    const tbody = document.getElementById('tableBody');
    const empty = document.getElementById('emptyState');
    const total = this.filteredData.length;
    const start = (this.currentPage - 1) * this.pageSize;
    const pageData = this.filteredData.slice(start, start + this.pageSize);

    if (total === 0) {
      tbody.innerHTML = '';
      empty.style.display = '';
      document.getElementById('paginationInfo').textContent = 'Mostrando 0 de 0 registros';
      document.getElementById('paginationControls').innerHTML = '';
      return;
    }

    empty.style.display = 'none';

    tbody.innerHTML = pageData.map(r => `
      <tr>
        <td>${this._fmtDate(r.fecha)}</td>
        <td>${this._esc(r.cdno)}</td>
        <td><span class="font-mono">${this._esc(r.patchPanel)}</span></td>
        <td>${this._esc(r.puerto)}</td>
        <td><strong>${this._esc(r.cliente)}</strong></td>
        <td><span class="font-mono">${this._esc(r.origen)}</span></td>
        <td>${this._destinoBadge(r.destino)}</td>
        <td title="${this._esc(r.observaciones)}">${this._esc(r.observaciones)}</td>
        <td class="route-cell" title="${this._esc(r.ruta)}">${this._esc(r.ruta)}</td>
        <td>
          <div class="row-actions">
            <button class="row-action-btn" onclick="app.editRecord('${r.id}')" title="Editar">✏️</button>
            <button class="row-action-btn delete" onclick="app.deleteRecord('${r.id}')" title="Eliminar">🗑️</button>
          </div>
        </td>
      </tr>
    `).join('');

    // Pagination info
    const end = Math.min(start + this.pageSize, total);
    document.getElementById('paginationInfo').textContent =
      `Mostrando ${start + 1} – ${end} de ${total} registros`;

    // Pagination controls
    this._renderPagination(total);
  }

  _renderPagination(total) {
    const totalPages = Math.ceil(total / this.pageSize);
    const container = document.getElementById('paginationControls');

    if (totalPages <= 1) { container.innerHTML = ''; return; }

    let html = `<button class="page-btn" ${this.currentPage <= 1 ? 'disabled' : ''} onclick="app.goToPage(${this.currentPage - 1})">◀</button>`;

    const maxVisible = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);

    if (startPage > 1) html += `<button class="page-btn" onclick="app.goToPage(1)">1</button><span style="color:var(--text-muted);padding:0 4px;">…</span>`;

    for (let i = startPage; i <= endPage; i++) {
      html += `<button class="page-btn ${i === this.currentPage ? 'active' : ''}" onclick="app.goToPage(${i})">${i}</button>`;
    }

    if (endPage < totalPages) html += `<span style="color:var(--text-muted);padding:0 4px;">…</span><button class="page-btn" onclick="app.goToPage(${totalPages})">${totalPages}</button>`;

    html += `<button class="page-btn" ${this.currentPage >= totalPages ? 'disabled' : ''} onclick="app.goToPage(${this.currentPage + 1})">▶</button>`;

    container.innerHTML = html;
  }

  goToPage(page) {
    this.currentPage = page;
    this._renderTable();
  }

  _destinoBadge(destino) {
    if (!destino) return '';
    const d = destino.toUpperCase();
    if (d.includes('CARRIER')) return `<span class="status-badge carrier">${this._esc(destino)}</span>`;
    return this._esc(destino);
  }

  // ── KPIs ───────────────────────────────────────────────────

  _updateKPIs() {
    const data = this.filteredData;
    const daycoCount = data.filter(d => (d.destino || '').toUpperCase().includes('DAYCO')).length;
    const carriers = new Set(data
      .map(d => (d.destino || '').trim())
      .filter(v => v && !v.toUpperCase().includes('DAYCO'))
    );

    document.getElementById('kpiTotal').textContent = data.length;
    document.getElementById('kpiDayco').textContent = daycoCount;
    document.getElementById('kpiCarriers').textContent = carriers.size;
    document.getElementById('kpiPatchPanels').textContent = new Set(data.map(d => d.patchpanel).filter(Boolean)).size;
  }

  _updateBadge() {
    document.getElementById('dataCount').textContent = this.data.length;
  }

  // ── Client Dropdown ────────────────────────────────────────

  _updateClientDropdown() {
    const select = document.getElementById('globalClientFilter');
    const current = select.value;
    
    const clients = [...new Set(this.data.map(d => d.cliente).filter(Boolean))].sort();
    const carriers = [...new Set(this.data
      .map(d => (d.destino || '').trim())
      .filter(v => v && !v.toUpperCase().includes('DAYCO'))
    )].sort();

    let html = '<option value="">🏢 Todos los Clientes / Carriers</option>';
    
    if (clients.length > 0) {
      html += '<optgroup label="Clientes">';
      html += clients.map(c => `<option value="client:${this._esc(c)}" ${'client:'+c === current ? 'selected' : ''}>${this._esc(c)}</option>`).join('');
      html += '</optgroup>';
    }

    if (carriers.length > 0) {
      html += '<optgroup label="Carriers">';
      html += carriers.map(c => `<option value="carrier:${this._esc(c)}" ${'carrier:'+c === current ? 'selected' : ''}>${this._esc(c)}</option>`).join('');
      html += '</optgroup>';
    }

    select.innerHTML = html;
  }

  // ── Route Summary Table ────────────────────────────────────

  _renderRouteSummary() {
    const tbody = document.getElementById('routeSummaryBody');
    const emptyState = document.getElementById('routeEmptyState');
    const countEl = document.getElementById('routeSummaryCount');
    const tableEl = document.getElementById('routeSummaryTable');
    let data = [...this.filteredData];

    if (data.length === 0) {
      tbody.innerHTML = '';
      tableEl.style.display = 'none';
      emptyState.style.display = '';
      countEl.textContent = '';
      return;
    }

    // Sort data for dashboard
    if (this.routeSortColumn) {
      data.sort((a, b) => {
        let va = (a[this.routeSortColumn] || '').toString().toLowerCase();
        let vb = (b[this.routeSortColumn] || '').toString().toLowerCase();
        if (this.routeSortColumn === 'puerto') {
          va = parseInt(va) || 0;
          vb = parseInt(vb) || 0;
        }
        if (va < vb) return this.routeSortAsc ? -1 : 1;
        if (va > vb) return this.routeSortAsc ? 1 : -1;
        return 0;
      });
    }

    // Update Header Icons
    document.querySelectorAll('#routeSummaryTable th[data-sort]').forEach(th => {
      const icon = th.querySelector('.sort-icon');
      if (th.dataset.sort === this.routeSortColumn) {
        th.classList.add('sorted');
        icon.textContent = this.routeSortAsc ? '↑' : '↓';
      } else {
        th.classList.remove('sorted');
        icon.textContent = '↕';
      }
    });

    tableEl.style.display = '';
    emptyState.style.display = 'none';
    countEl.textContent = `${data.length} conexiones`;

    tbody.innerHTML = data.map((r, i) => {
      const hasRoute = r.ruta && r.ruta.trim();
      return `
        <tr>
          <td style="color:var(--text-muted);font-size:0.78rem;">${i + 1}</td>
          <td><span class="font-mono">${this._esc(r.patchPanel)}</span></td>
          <td>${this._esc(r.puerto)}</td>
          <td><strong>${this._esc(r.cliente)}</strong></td>
          <td><span class="font-mono">${this._esc(r.origen)}</span></td>
          <td>${this._destinoBadge(r.destino)}</td>
          <td class="route-cell" style="max-width:none;white-space:normal;word-break:break-all;
              background:rgba(56,189,248,0.04);padding:10px 14px;
              ${hasRoute ? '' : 'color:var(--text-muted);font-style:italic;'}">
            ${hasRoute ? this._esc(r.ruta) : '— sin ruta —'}
          </td>
        </tr>
      `;
    }).join('');
  }

  // ── Charts ─────────────────────────────────────────────────

  _initCharts() {
    if (typeof Chart === 'undefined') return;
    // Chart.js global defaults for dark theme
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = 'rgba(148, 163, 184, 0.1)';
    Chart.defaults.font.family = "'Inter', sans-serif";

    this.charts.destinos = this._createChart('chartDestinos', 'bar');
    this.charts.patchPanels = this._createChart('chartPatchPanels', 'bar');
    this.charts.origenes = this._createChart('chartOrigenes', 'bar');
  }

  _createChart(canvasId, type) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const isDoughnut = type === 'doughnut';

    return new Chart(ctx, {
      type,
      data: { labels: [], datasets: [{ data: [], backgroundColor: this.CHART_COLORS, borderWidth: 0 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: isDoughnut,
            position: 'right',
            labels: { boxWidth: 12, padding: 12, font: { size: 11 } }
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleFont: { weight: '600' },
            padding: 12,
            cornerRadius: 8,
            borderColor: 'rgba(148, 163, 184, 0.2)',
            borderWidth: 1,
          }
        },
        ...(isDoughnut ? {
          cutout: '65%',
        } : {
          indexAxis: 'y',
          scales: {
            x: {
              grid: { color: 'rgba(148, 163, 184, 0.06)' },
              ticks: { font: { size: 11 } }
            },
            y: {
              grid: { display: false },
              ticks: { font: { size: 11 } }
            }
          }
        })
      }
    });
  }

  _updateCharts() {
    const data = this.filteredData;

    // Count occurrences helper
    const counts = (key) => {
      const map = {};
      data.forEach(d => {
        const val = (d[key] || '').trim();
        if (val) map[val] = (map[val] || 0) + 1;
      });
      return Object.entries(map).sort((a, b) => b[1] - a[1]);
    };

    // Destinos / Carriers (bar) - excluding DAYCO
    const destData = counts('destino').filter(c => !c[0].toUpperCase().includes('DAYCO')).slice(0, 12);
    this.charts.destinos.data.labels = destData.map(c => c[0]);
    this.charts.destinos.data.datasets[0].data = destData.map(c => c[1]);
    this.charts.destinos.data.datasets[0].backgroundColor = this.CHART_COLORS.slice(0, destData.length);
    this.charts.destinos.update('none');

    // Patch Panels (bar)
    const ppData = counts('patchpanel').slice(0, 12);
    this.charts.patchPanels.data.labels = ppData.map(c => c[0]);
    this.charts.patchPanels.data.datasets[0].data = ppData.map(c => c[1]);
    this.charts.patchPanels.data.datasets[0].backgroundColor = this.CHART_COLORS.slice(0, ppData.length);
    this.charts.patchPanels.update('none');

    // Origenes (bar)
    const origData = counts('origen').slice(0, 12);
    this.charts.origenes.data.labels = origData.map(c => c[0]);
    this.charts.origenes.data.datasets[0].data = origData.map(c => c[1]);
    this.charts.origenes.data.datasets[0].backgroundColor = this.CHART_COLORS.slice(0, origData.length);
    this.charts.origenes.update('none');
  }

  // ── Edit / Delete ──────────────────────────────────────────

  editRecord(id) {
    const record = this.data.find(d => d.id === id);
    if (!record) return;

    document.getElementById('editId').value = id;
    document.getElementById('editFecha').value = record.fecha;
    document.getElementById('editCdno').value = record.cdno;
    document.getElementById('editPatchPanel').value = record.patchpanel;
    document.getElementById('editPuerto').value = record.puerto;
    document.getElementById('editCliente').value = record.cliente;
    document.getElementById('editOrigen').value = record.origen;
    document.getElementById('editDestino').value = record.destino;
    document.getElementById('editObservaciones').value = record.observaciones;
    document.getElementById('editRuta').value = record.ruta;

    document.getElementById('editModal').classList.add('active');

    // Save handler
    document.getElementById('editForm').onsubmit = (e) => {
      e.preventDefault();
      this._saveEdit();
    };
  }

  _saveEdit() {
    const id = document.getElementById('editId').value;
    const idx = this.data.findIndex(d => d.id === id);
    if (idx === -1) return;

    this.data[idx] = {
      ...this.data[idx],
      fecha: document.getElementById('editFecha').value,
      cdno: document.getElementById('editCdno').value.trim(),
      patchpanel: document.getElementById('editPatchPanel').value.trim(),
      puerto: parseInt(document.getElementById('editPuerto').value) || null,
      cliente: document.getElementById('editCliente').value.trim().toUpperCase(),
      origen: document.getElementById('editOrigen').value.trim(),
      destino: document.getElementById('editDestino').value.trim(),
      observaciones: document.getElementById('editObservaciones').value.trim(),
      ruta: document.getElementById('editRuta').value.trim(),
    };

    this._saveData(this.data[idx]);
    this.closeEditModal();
    this._applyFilters();
    this._updateDataLists();
    this._toast('Registro actualizado', 'success');
  }

  closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
  }

  deleteRecord(id) {
    this.recordToDelete = id;
    document.getElementById('deleteModal').classList.add('active');
  }

  confirmDelete() {
    if (!this.recordToDelete) return;
    const id = this.recordToDelete;
    
    // Remove from local memory first
    this.data = this.data.filter(d => d.id !== id);
    
    // Then call DB delete
    this._deleteFromDb(id);
    
    // Save local cache ONLY (avoid full DB sync)
    localStorage.setItem('dcm_cabling_data', JSON.stringify(this.data));
    
    this.closeDeleteModal();
    this._applyFilters();
    this._toast('Registro eliminado', 'info');
  }

  closeDeleteModal() {
    this.recordToDelete = null;
    document.getElementById('deleteModal').classList.remove('active');
  }


  // ── Export ─────────────────────────────────────────────────

  exportCSV() {
    if (this.filteredData.length === 0) {
      this._toast('No hay datos para exportar', 'warning');
      return;
    }

    const headers = this.FIELDS.map(f => f.label);
    const rows = this.filteredData.map(r =>
      this.FIELDS.map(f => `"${(r[f.key] || '').replace(/"/g, '""')}"`)
    );

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const BOM = '\uFEFF'; // UTF-8 BOM for Excel
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    // Dynamic filename based on client filter
    let clientName = 'Todos';
    if (this.clientFilter) {
      clientName = this.clientFilter.includes(':') ? this.clientFilter.split(':')[1] : this.clientFilter;
    }
    // Sanitize filename
    const safeName = clientName.replace(/[\\/:*?"<>|]/g, '_');

    const a = document.createElement('a');
    a.href = url;
    a.download = `Cableado_${safeName}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    this._toast(`${this.filteredData.length} registros exportados`, 'success');
  }

  // ── Utilities ──────────────────────────────────────────────

  _genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  _esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  _fmtDate(str) {
    if (!str) return '';
    try {
      const parts = str.split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    } catch {}
    return str;
  }

  // ── Toast Notifications ────────────────────────────────────

  _toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
      <span class="toast-message">${message}</span>
      <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
}

// ── Initialize ─────────────────────────────────────────────

const app = new CablingApp();
