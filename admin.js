// Buyzo Cart Admin Panel - JavaScript

    // Initialize window.siteConfig globally at the very top
    window.siteConfig = {
      imgbbKey: '',
      razorpayKeyId: '',
      googleMapsKey: ''
    };

    let ADMIN_IMGBB_KEY = 'YOUR_IMGBB_API_KEY_HERE';

    // Initialize Firebase using global firebaseConfig from config.js
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();
    const storage = firebase.storage();
    const auth = firebase.auth();

    async function loadSiteConfig() {
      try {
        const snap = await database.ref('owner_vault/config').once('value');
        if (snap.exists()) {
          const config = snap.val();
          window.siteConfig = {
            imgbbKey: config.thirdParty?.imgbbKey || '',
            razorpayKeyId: config.payment?.razorpayKeyId || '',
            googleMapsKey: config.thirdParty?.googleMapsKey || ''
          };
          if (window.siteConfig.imgbbKey) {
            ADMIN_IMGBB_KEY = window.siteConfig.imgbbKey;
          }
        }
      } catch(e) {
        console.warn('Could not load site config:', e);
      }
    }

    // ===== SECURITY: Allowed admin emails =====
    const ALLOWED_ADMIN_EMAILS = [
      'aryakaran836@gmail.com',
      'buyzocartshop@gmail.com'
    ];

    function isAllowedAdmin(email) {
      return ALLOWED_ADMIN_EMAILS.includes((email || '').toLowerCase().trim());
    }

    function showLoginError(msg) {
      const el = document.getElementById('adminLoginError');
      if (el) el.textContent = msg;
    }

    // Google Sign-In
    async function adminGoogleLogin() {
      showLoginError('');
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await auth.signInWithPopup(provider);
        const email = result.user.email;
        if (!isAllowedAdmin(email)) {
          await auth.signOut();
          showLoginError('❌ Access denied. This Gmail is not authorized as admin.');
          return;
        }
        onAdminLoginSuccess();
      } catch(err) {
        showLoginError('Google sign-in failed: ' + (err.message || err));
      }
    }

    async function onAdminLoginSuccess() {
      await loadSiteConfig();
      document.getElementById('adminLoginPage').style.display = 'none';
      document.getElementById('adminPanel').style.display = 'flex';
      loadDashboardData();
      loadProducts();
      loadCategories();
      loadOrders();
      loadTrendingProducts();
      loadSimilarProducts();
      loadSearchTags();
      loadPopularSearches();
      loadCustomers();
      loadBanners();
      loadPolicies();
      loadSettings();
      loadOffers();
      loadNotifHistory();
      loadCategoriesForDropdown();
      loadSellerRequests();
      loadBrandsPanel();
      loadBrandRequests();
      setTimeout(() => {
        setupOnlineUsersTracking();
        setupRealtimeOrderListener();
        addAdminSharingMenuItem();
      }, 1200);
    }

    function logout() {
      auth.signOut().then(() => {
        document.getElementById('adminLoginPage').style.display = 'flex';
        document.getElementById('adminPanel').style.display = 'none';
      });
    }

    // ===== Admin State =====
    let currentAdminTab = 'dashboard';
    let currentProductsPage = 1;
    let currentOrdersPage = 1;
    let currentCustomersPage = 1;
    let currentSimilarProductsPage = 1;
    let productsPerPage = 10;
    let ordersPerPage = 10;
    let customersPerPage = 10;
    let similarProductsPerPage = 10;
    let uploadedImages = [];
    let uploadedCategoryImage = null;
    let uploadedBannerImage = null;
    let allCategories = [];
    let allProductsForSimilar = [];
    let allSearchTags = [];
    let allPopularSearches = [];
    let currentDateFilter = { type: 'all', startDate: null, endDate: null };
    
    // Tag product management state
    let currentTagForProducts = null;
    let selectedProductsForTag = new Set();
    let currentAddOption = 'all';
    let currentCategoryForAdd = null;
    let allProductsCache = [];

    // ===== PAGE VISIBILITY FIX - website tab switch karke wapas aane per kaam kare =====
    function setupPageVisibilityFix() {
      document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
          // Page visible ho gayi - data reload karo
          const panel = document.getElementById('adminPanel');
          if (panel && panel.style.display !== 'none') {
            // Re-attach Firebase listeners if disconnected
            if (currentAdminTab === 'dashboard') {
              loadDashboardData();
            }
            // Reconnect Firebase realtime database
            database.goOnline && database.goOnline();
          }
        }
      });

      // Page focus pe bhi reconnect
      window.addEventListener('focus', function() {
        database.goOnline && database.goOnline();
      });

      window.addEventListener('pageshow', function(e) {
        if (e.persisted) {
          // bfcache se wapas aaya - page reload karo
          window.location.reload();
        }
      });
    }

    // ===== TOAST NOTIFICATION =====
    function showToast(msg, type = 'info') {
      const toast = document.getElementById('adminToast');
      if (!toast) return;
      const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
      toast.className = `show toast-${type}`;
      toast.innerHTML = `<i class="fas ${icons[type] || 'fa-info-circle'}"></i> ${msg}`;
      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => { toast.classList.remove('show'); }, 3500);
    }

    // ===== MOBILE BACK BUTTON FIX =====
    // Push state so back button doesn't leave the page
    function setupMobileBackFix() {
      // Push initial state
      history.pushState({ page: 'admin' }, '', window.location.href);
      
      window.addEventListener('popstate', function(e) {
        // When back is pressed, push state again to stay on page
        history.pushState({ page: 'admin' }, '', window.location.href);
        
        // If a modal is open, close it instead
        const openModal = document.querySelector('.modal.active');
        if (openModal) {
          openModal.classList.remove('active');
          return;
        }
        // If not on dashboard, go to dashboard
        if (currentAdminTab !== 'dashboard') {
          showTab('dashboard');
        }
      });
    }

    // ===== COPY/RIGHT-CLICK DISABLE =====
    function setupCopyProtection() {
      document.addEventListener('contextmenu', function(e) {
        // Allow on inputs/textareas
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        e.preventDefault();
      });
      document.addEventListener('copy', function(e) {
        // Allow copy from inputs/textareas and readonly inputs
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
      });
      document.addEventListener('keydown', function(e) {
        // Block Ctrl+A, Ctrl+C, Ctrl+U (view source), Ctrl+S
        if (e.ctrlKey || e.metaKey) {
          if (['a','c','u','s'].includes(e.key.toLowerCase())) {
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            e.preventDefault();
          }
        }
      });
    }

    // Initialize admin panel
    function initAdminPanel() {
      _setupAdminUI();
      setupMobileBackFix();
      setupCopyProtection();
      setupPageVisibilityFix();

      const urlParams = new URLSearchParams(window.location.search);
      const shareId = urlParams.get('share');
      if (shareId) { checkSharedAccess(); return; }

      // Re-verify shared admin on page refresh
      const savedShareId = sessionStorage.getItem('sharedAdminId');
      if (savedShareId) {
        // Wait for Firebase auth to resolve (auth.currentUser is null on load)
        const unsubVerify = auth.onAuthStateChanged(async function(user) {
          unsubVerify(); // run only once
          try {
            const snap = await database.ref('sharedAdmins/' + savedShareId).once('value');
            if (snap.exists() && snap.val() && snap.val().status === 'active') {
              const sd = snap.val();
              const permsRaw = sessionStorage.getItem('sharedPermissions');
              sd.permissions = permsRaw ? JSON.parse(permsRaw) : (sd.permissions || []);
              if (user) {
                // Write sharedAdminsByUid so Firebase rules work
                await database.ref('sharedAdminsByUid/' + user.uid).set({
                  shareId: savedShareId, email: user.email || '',
                  permissions: sd.permissions, grantedAt: Date.now()
                }).catch(()=>{});
                // Small wait for rules to propagate
                await new Promise(r => setTimeout(r, 300));
                document.getElementById('adminLoginPage').style.display = 'none';
                document.getElementById('adminPanel').style.display = 'flex';
                loadDashboardData(); loadProducts(); loadCategories(); loadCategoriesForDropdown();
                showLimitedAdminPanel(sd.permissions);
                return;
              }
            }
          } catch(e) { console.error('reVerify error:', e); }
          sessionStorage.removeItem('sharedAdminId');
          sessionStorage.removeItem('sharedPermissions');
          document.getElementById('adminLoginPage').style.display = 'flex';
        });
        return;
      }

      auth.onAuthStateChanged(user => {
        // Don't override if shared admin is already verified via sessionStorage
        if (sessionStorage.getItem('sharedAdminId')) return;
        if (user && isAllowedAdmin(user.email)) {
          onAdminLoginSuccess();
        } else {
          if (user) auth.signOut();
          document.getElementById('adminLoginPage').style.display = 'flex';
          document.getElementById('adminPanel').style.display = 'none';
        }
      });
    }

    function _setupAdminUI() {
      document.querySelectorAll('.menu-item').forEach(tab => {
        tab.addEventListener('click', function(e) {
          e.preventDefault(); // Always prevent default href="#" navigation

          const action = this.dataset.action;
          const tabName = this.dataset.tab;

          // Handle special actions
          if (action === 'seller-lookup') {
            if (window.innerWidth <= 1024) closeSidebar();
            setTimeout(function() {
              var inp = document.getElementById('sellerLookupInput');
              if (inp) inp.value = '';
              var rd = document.getElementById('sellerLookupResult');
              if (rd) rd.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:20px;">Enter Seller ID, Gmail or Phone Number</p>';
              var m = document.getElementById('sellerLookupModal');
              if (m) m.classList.add('active');
            }, window.innerWidth <= 1024 ? 300 : 0);
            return;
          }

          if (action === 'logout') {
            if (typeof logout === 'function') logout();
            return;
          }

          // Handle tab navigation
          if (tabName) {
            showTab(tabName);
            if (window.innerWidth <= 1024) closeSidebar();
          }
        });
      });
      
      document.querySelectorAll('.tabs .tab').forEach(tab => {
        tab.addEventListener('click', function() {
          const policy = this.dataset.policy;
          showPolicyTab(policy);
        });
      });
      
      document.getElementById('productSearch')?.addEventListener('input', filterProducts);
      document.getElementById('orderSearch')?.addEventListener('input', filterOrders);
      document.getElementById('customerSearch')?.addEventListener('input', filterCustomers);
      document.getElementById('similarProductsSearch')?.addEventListener('input', filterSimilarProducts);
      
      document.getElementById('selectAllOrders')?.addEventListener('change', function() {
        const checkboxes = document.querySelectorAll('#ordersTableBody input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
          checkbox.checked = this.checked;
        });
      });

      document.getElementById('settingsForm')?.addEventListener('submit', function(e) {
        e.preventDefault();
        saveSettings();
      });

      const modals = document.querySelectorAll('.modal');
      const closeButtons = document.querySelectorAll('.close');
      
      closeButtons.forEach(button => {
        button.addEventListener('click', function() {
          modals.forEach(modal => {
            modal.classList.remove('active');
          });
        });
      });
      
      modals.forEach(modal => {
        modal.addEventListener('click', function(e) {
          if (e.target === this) {
            this.classList.remove('active');
          }
        });
      });

      document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);
    }

    function closeModal(modalId) {
      document.getElementById(modalId)?.classList.remove('active');
    }

    function toggleSidebar() {
      const sidebar = document.getElementById('adminSidebar');
      const overlay = document.getElementById('sidebarOverlay');
      if (!sidebar || !overlay) return;

      const isOpen = sidebar.classList.contains('active');

      if (isOpen) {
        /* ── CLOSE sidebar ── */
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';          /* restore scroll */
      } else {
        /* ── OPEN sidebar ── */
        sidebar.classList.add('active');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';    /* prevent bg scroll on mobile */
      }
    }

    /* Close sidebar when clicking outside (overlay) */
    function closeSidebar() {
      const sidebar = document.getElementById('adminSidebar');
      const overlay = document.getElementById('sidebarOverlay');
      if (!sidebar || !overlay) return;
      sidebar.classList.remove('active');
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    }

    /* Auto-close sidebar on resize to desktop */
    window.addEventListener('resize', function() {
      if (window.innerWidth > 1024) {
        const sidebar  = document.getElementById('adminSidebar');
        const overlay  = document.getElementById('sidebarOverlay');
        if (sidebar)  sidebar.classList.remove('active');
        if (overlay)  overlay.classList.remove('active');
        document.body.style.overflow = '';
      }
    });

    // ===== ADMIN SHARING SYSTEM =====
    function addAdminSharingMenuItem() {
      const el = document.getElementById('adminSharingMenuItem');
      if (isSuperAdmin()) { if (el) el.style.display = ''; }
      else { if (el) el.style.display = 'none'; }
    }

    function isSuperAdmin() {
      const user = auth.currentUser;
      return user && ALLOWED_ADMIN_EMAILS.includes(user.email);
    }

    function showAdminSharing() {
      document.getElementById('adminSharingModal').classList.add('active');
    }

    function toggleAllPermissions() {
      const checkAll = document.getElementById('permAll').checked;
      document.querySelectorAll('[id^="perm"]').forEach(cb => {
        if (cb.id !== 'permAll') {
          cb.checked = checkAll;
        }
      });
    }

    function generateShareLink() {
      const recipientEmail = (document.getElementById('shareAdminEmail') || document.getElementById('shareRecipientEmail') || {value:''}).value.trim();
      
      const permissions = [];
      document.querySelectorAll('[id^="perm"]:checked').forEach(cb => {
        if (cb.id !== 'permAll') permissions.push(cb.value);
      });
      
      if (permissions.length === 0) {
        showToast('Please select at least one permission', 'error');
        return;
      }

      const btn = document.getElementById('generateShareBtn');
      if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...'; btn.disabled = true; }
      
      const shareId = 'share_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const creatorEmail = (auth.currentUser && auth.currentUser.email) ? auth.currentUser.email : 'super-admin';
      const shareData = {
        email: recipientEmail || '',
        permissions: permissions,
        status: 'active',
        createdBy: creatorEmail,
        createdAt: Date.now(),
        lastAccessed: null
      };

      const doWrite = () => database.ref('sharedAdmins/' + shareId).set(shareData);

      doWrite().then(() => {
        const shareLink = `${window.location.origin}${window.location.pathname}?share=${shareId}`;
        document.getElementById('generatedShareLink').value = shareLink;
        document.getElementById('shareLinkResult').style.display = 'block';
        if (btn) { btn.innerHTML = '<i class="fas fa-check-circle"></i> Link Generated!'; btn.disabled = false; }
        showToast('Share link generated!', 'success');

        // Auto open Gmail
        const permissionLabels = { products:'Products', categories:'Categories', orders:'Orders', offers:'Offers', banners:'Banners', trending:'Trending', similar:'Similar Products', reviews:'Reviews', notifications:'Notifications', searchTags:'Search Tags', popularSearches:'Popular Searches', customers:'Customers', policies:'Policies', sellerRequests:'Seller Requests', hero:'Hero Section', userListings:'User Listing', brands:'Brands', analytics:'Analytics' };
        const permNames = permissions.map(p => '• ' + (permissionLabels[p] || p)).join('\n');
        const subject = 'Admin Panel Access — Buyzo Cart';
        const body = `Namaste,\n\nAapko Buyzo Cart Admin Panel ka limited access diya gaya hai.\n\n🔗 Access Link:\n${shareLink}\n\n✅ Aapki Permissions:\n${permNames}\n\n📌 Note: Yeh link sirf aapke liye hai. Kisi aur ke saath share mat karein.\n\n— Buyzo Cart Admin Team`;
        const toEmail = recipientEmail || '';
        const mailtoUrl = 'mailto:' + encodeURIComponent(toEmail) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
        setTimeout(function() { window.location.href = mailtoUrl; }, 500);

      }).catch(err => {
        // REST API fallback
        fetch(`https://buyzocart-default-rtdb.firebaseio.com/sharedAdmins/${shareId}.json`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(shareData)
        }).then(r => r.json()).then(result => {
          if (result && result.status) {
            const shareLink = `${window.location.origin}${window.location.pathname}?share=${shareId}`;
            document.getElementById('generatedShareLink').value = shareLink;
            document.getElementById('shareLinkResult').style.display = 'block';
            if (btn) { btn.innerHTML = '<i class="fas fa-check-circle"></i> Link Generated!'; btn.disabled = false; }
            showToast('Link generated!', 'success');
            const toEmail = recipientEmail || '';
            const subject = 'Admin Panel Access — Buyzo Cart';
            const body = `Access Link: ${shareLink}`;
            window.location.href = 'mailto:' + encodeURIComponent(toEmail || '') + '?subject=' + encodeURIComponent(subject || '') + '&body=' + encodeURIComponent(body || '');
          } else {
            showToast('Firebase permission error — Database Rules check karein', 'error');
            if (btn) { btn.innerHTML = '<i class="fas fa-paper-plane"></i> Generate Link & Send Email'; btn.disabled = false; }
          }
        }).catch(() => {
          showToast('Error: ' + err.message, 'error');
          if (btn) { btn.innerHTML = '<i class="fas fa-paper-plane"></i> Generate Link & Send Email'; btn.disabled = false; }
        });
      });
    }

    function copyShareLink() {
      const input = document.getElementById('generatedShareLink');
      if (!input || !input.value) return;
      navigator.clipboard ? navigator.clipboard.writeText(input.value).then(() => showToast('Link copied!', 'success'))
        : (input.select(), document.execCommand('copy'), showToast('Link copied!', 'success'));
    }

    function sendShareEmail() {
      const email = (document.getElementById('shareRecipientEmail') || document.getElementById('shareAdminEmail') || {}).value || '';
      const link = document.getElementById('generatedShareLink').value;
      const subject = 'Admin Panel Access — Buyzo Cart';
      const body = `Access Link: ${link}`;
      window.location.href = 'mailto:' + encodeURIComponent(email) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    }

    function sendShareEmailAgain() {
      const email = (document.getElementById('shareRecipientEmail') || document.getElementById('shareAdminEmail') || {}).value || '';
      const link = document.getElementById('generatedShareLink').value;
      if (!link) return;
      const subject = 'Admin Panel Access — Buyzo Cart';
      const body = `Namaste,\n\nAapko Buyzo Cart Admin Panel ka limited access diya gaya hai.\n\n🔗 Access Link:\n${link}\n\n— Buyzo Cart Admin Team`;
      window.location.href = 'mailto:' + encodeURIComponent(email) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    }

    async function checkSharedAccess() {
      const urlParams = new URLSearchParams(window.location.search);
      const shareId = urlParams.get('share');
      if (!shareId) return;

      // Show a full-page loading overlay (don't destroy DOM)
      const overlay = document.createElement('div');
      overlay.id = 'shareLoadOverlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;z-index:99999;font-family:Segoe UI,sans-serif;';
      overlay.innerHTML = `
        <div style="background:white;border-radius:20px;padding:40px 48px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.25);max-width:360px;width:90%;">
          <div style="font-size:48px;margin-bottom:16px;">🔐</div>
          <h2 style="color:#0f172a;margin-bottom:8px;font-size:1.4rem;">Verifying Access</h2>
          <p style="color:#64748b;font-size:14px;">Please wait...</p>
          <div style="margin-top:20px;height:4px;background:#e2e8f0;border-radius:2px;overflow:hidden;">
            <div style="height:100%;width:0%;background:linear-gradient(90deg,#667eea,#764ba2);border-radius:2px;transition:width 2s linear;" id="shareProgressBar"></div>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      setTimeout(() => { const b = document.getElementById('shareProgressBar'); if(b) b.style.width='90%'; }, 100);

      let shareData = null;

      // Method 1: Public REST fetch (sharedAdmins/$shareId .read = true in rules)
      try {
        const res = await fetch('https://buyzocart-default-rtdb.firebaseio.com/sharedAdmins/' + shareId + '.json', { cache: 'no-store' });
        if (res.ok) { const json = await res.json(); if (json && typeof json === 'object' && json.status) shareData = json; }
      } catch(e) {}
      // Method 2: SDK fallback
      if (!shareData) {
        try { const snap = await database.ref('sharedAdmins/' + shareId).once('value'); if (snap.exists()) shareData = snap.val(); } catch(e2) {}
      }

      // Remove overlay
      overlay.remove();

      // Handle result
      if (!shareData) {
        showShareFullPage('🔗', '#ef4444', 'Link Not Found',
          'This access link is invalid or has been deleted. Please ask the admin for a new link.');
        return;
      }
      if (shareData.status === 'suspended') {
        showShareFullPage('🚫', '#f59e0b', 'Access Suspended',
          'Your admin access has been suspended. Please contact the main admin to restore access.');
        return;
      }
      if (shareData.status !== 'active') {
        showShareFullPage('❌', '#ef4444', 'Link Inactive',
          'This access link is no longer active. Ask the main admin to reactivate it.');
        return;
      }

      const requiredEmail = (shareData.email || '').toLowerCase().trim();
      if (requiredEmail) {
        showSharedGoogleLogin(shareId, shareData, requiredEmail);
      } else {
        await grantSharedAccess(shareId, shareData);
      }
    }

    function showShareFullPage(icon, color, title, message, showLoginBtn) {
      document.body.innerHTML = '';
      document.body.style.cssText = 'margin:0;padding:0;min-height:100vh;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;font-family:Segoe UI,sans-serif;padding:20px;box-sizing:border-box;';
      document.body.innerHTML = `
        <div style="background:white;border-radius:20px;padding:44px 36px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.25);max-width:380px;width:100%;">
          <div style="font-size:54px;margin-bottom:16px;">${icon}</div>
          <h2 style="color:${color};font-size:1.5rem;margin-bottom:12px;font-weight:800;">${title}</h2>
          <p style="color:#64748b;font-size:14px;line-height:1.7;">${message}</p>
        </div>`;
    }

    function showSharedGoogleLogin(shareId, shareData, requiredEmail) {
      document.getElementById('adminLoginPage').style.display = 'flex';
      document.getElementById('adminPanel').style.display = 'none';
      document.getElementById('adminLoginPage').innerHTML = `
        <div class="login-card">
          <div class="login-logo">
            <div style="font-size:40px;margin-bottom:8px;">🛒</div>
            <h1 class="login-title">Buyzo Cart</h1>
            <p class="login-subtitle">Admin Panel — Shared Access</p>
          </div>
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#1d4ed8;text-align:center;">
            <i class="fas fa-info-circle"></i> Only <strong>${requiredEmail}</strong> can sign in here
          </div>
          <button onclick="sharedAdminGoogleLogin('${shareId}', '${requiredEmail}')" style="width:100%;display:flex;align-items:center;justify-content:center;gap:12px;padding:14px 20px;background:#fff;color:#333;border:1.5px solid #ddd;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;" onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.12)'" onmouseout="this.style.boxShadow='none'">
            <img src="https://developers.google.com/identity/images/g-logo.png" width="22" height="22" alt="Google">
            Sign in with Google
          </button>
          <div id="sharedLoginError" style="color:#ef4444;margin-top:14px;text-align:center;font-size:13px;min-height:20px;"></div>
        </div>`;
    }

    async function sharedAdminGoogleLogin(shareId, requiredEmail) {
      const errEl = document.getElementById('sharedLoginError');
      if (errEl) errEl.textContent = '';
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ login_hint: requiredEmail });
        const result = await auth.signInWithPopup(provider);
        const loggedEmail = (result.user.email || '').toLowerCase().trim();
        if (loggedEmail !== requiredEmail) {
          await auth.signOut();
          if (errEl) errEl.textContent = `❌ Wrong Gmail! Sirf ${requiredEmail} se login karein.`;
          return;
        }
        // Email matches — fetch share data again and grant access
        const res = await fetch(`https://buyzocart-default-rtdb.firebaseio.com/sharedAdmins/${shareId}.json`);
        const shareData = await res.json();
        if (shareData && shareData.status === 'active') {
          await grantSharedAccess(shareId, shareData, result.user);
        } else {
          if (errEl) errEl.textContent = 'Access has been revoked.';
        }
      } catch(err) {
        if (errEl) errEl.textContent = 'Login failed: ' + (err.message || err);
      }
    }

    async function grantSharedAccess(shareId, shareData, user) {
      await loadSiteConfig();
      sessionStorage.setItem('sharedAdminId', shareId);
      sessionStorage.setItem('sharedPermissions', JSON.stringify(shareData.permissions));
      // ROOT FIX: write uid so Firebase rules work
      if (user && user.uid) {
        // Force token refresh so new sharedAdminsByUid write is authorized
        user.getIdToken(true).then(() => {
          database.ref('sharedAdminsByUid/' + user.uid).set({
            shareId: shareId, email: user.email || shareData.email || '',
            permissions: shareData.permissions || [], grantedAt: Date.now()
          }).catch(e => console.error('sharedAdminsByUid write failed:', e));
          database.ref('sharedAdmins/' + shareId + '/uid').set(user.uid).catch(()=>{});
        }).catch(()=>{
          // Fallback without token refresh
          database.ref('sharedAdminsByUid/' + user.uid).set({
            shareId: shareId, email: user.email || shareData.email || '',
            permissions: shareData.permissions || [], grantedAt: Date.now()
          }).catch(()=>{});
        });
        sessionStorage.setItem('sharedAdminUid', user.uid);
        sessionStorage.setItem('sharedAdminEmail', user.email || '');
      }
      // Update lastAccessed
      fetch(`https://buyzocart-default-rtdb.firebaseio.com/sharedAdmins/${shareId}/lastAccessed.json`, {
        method: 'PUT', body: JSON.stringify(Date.now())
      }).catch(() => {});

      // Log login activity
      const logEntry = { type: 'login', description: 'Panel Access - Login', detail: 'Shared admin ne panel access kiya', timestamp: Date.now() };
      fetch('https://buyzocart-default-rtdb.firebaseio.com/sharedAdminLogs/' + shareId + '.json', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(logEntry)
      }).catch(() => {});

      document.getElementById('adminLoginPage').style.display = 'none';
      document.getElementById('adminPanel').style.display = 'flex';

      // Load data
      loadDashboardData(); loadProducts(); loadCategories(); loadCategoriesForDropdown();
      if (shareData.permissions.includes('orders')) loadOrders();
      if (shareData.permissions.includes('trending')) loadTrendingProducts();
      if (shareData.permissions.includes('similar')) loadSimilarProducts();
      if (shareData.permissions.includes('searchTags')) loadSearchTags();
      if (shareData.permissions.includes('popularSearches')) loadPopularSearches();
      if (shareData.permissions.includes('customers')) loadCustomers();
      if (shareData.permissions.includes('banners')) loadBanners();
      if (shareData.permissions.includes('offers')) loadOffers();
      if (shareData.permissions.includes('notifications')) loadNotifHistory();
      if (shareData.permissions.includes('sellerRequests')) loadSellerRequests();
      if (shareData.permissions.includes('hero')) loadHeroSectionSettings();
      if (shareData.permissions.includes('userListings')) loadUserListings();
      if (shareData.permissions.includes('brands')) loadBrandsPanel();
      if (shareData.permissions.includes('brandRequests')) { if(typeof loadBrandRequests==='function') loadBrandRequests(); }
      if (shareData.permissions.includes('analytics')) loadAnalytics();
      if (shareData.permissions.includes('settings')) { if(typeof loadSettings==='function') loadSettings(); }
      setupOnlineUsersTracking();

      const displayEmail = user ? user.email : shareData.email || 'Shared Admin';
      const userAvatar = document.querySelector('.user-avatar');
      const userDiv = document.querySelector('.user-profile > div:last-child');
      if (userAvatar) userAvatar.textContent = displayEmail[0].toUpperCase();
      if (userDiv) userDiv.textContent = displayEmail;

      showLimitedAdminPanel(shareData.permissions);
    }

    function showSharedErrorPage(icon, title, message) {
      document.getElementById('adminLoginPage').style.display = 'flex';
      document.getElementById('adminPanel').style.display = 'none';
      document.getElementById('adminLoginPage').innerHTML = `
        <div class="login-card" style="text-align:center;">
          <div style="font-size:48px;margin-bottom:16px;">${icon}</div>
          <h2 style="color:#ef4444;margin-bottom:8px;">${title}</h2>
          <p style="color:#64748b;">${message}</p>
        </div>`;
    }

    function showLimitedAdminPanel(permissions) {
      document.querySelectorAll('.menu-item').forEach(item => {
        const tab = item.dataset.tab;
        if (tab && tab !== 'dashboard') item.style.display = 'none';
      });
      // Force hide admin-sharing and seller-lookup for shared admins
      const sharingLi = document.getElementById('adminSharingMenuItem');
      if (sharingLi) sharingLi.style.display = 'none';
      const sellerLookupItem = document.querySelector('.menu-item[data-tab="seller-lookup"]');
      if (sellerLookupItem) sellerLookupItem.closest('li') && (sellerLookupItem.closest('li').style.display = 'none');

      // Also hide logout? No - keep logout visible always
      // Hide admin-sharing menu item for shared admins (they can't share access)
      const adminSharingItem = document.querySelector('.menu-item[data-tab="admin-sharing"]');
      if (adminSharingItem) adminSharingItem.style.display = 'none';
      
      // Permission key → sidebar tab mapping
      const tabMapping = {
        'dashboard': 'dashboard',
        'products': 'products',
        'categories': 'categories',
        'banners': 'banners',
        'trending': 'trending',
        'similar': 'similar-products',
        'reviews': 'reviews',
        'notifications': 'notifications',
        'searchTags': 'search-tags',
        'popularSearches': 'popular-searches',
        'orders': 'orders',
        'offers': 'offers',
        'customers': 'customers',
        'policies': 'policies',
        'sellerRequests': 'seller-requests',
        'hero': 'hero',
        'userListings': 'user-listings',
        'brands': 'brands',
        'brandRequests': 'brand-requests',
        'analytics': 'analytics',
        'settings': 'settings'
      };
      // Show dashboard only if it's in permissions OR no permissions given (fallback)
      if (permissions.includes('dashboard') || permissions.length === 0) {
        const dashItem = document.querySelector('.menu-item[data-tab="dashboard"]');
        if (dashItem) dashItem.style.display = 'flex';
      }
      
      permissions.forEach(perm => {
        const tabId = tabMapping[perm];
        if (tabId) {
          const menuItem = document.querySelector(`.menu-item[data-tab="${tabId}"]`);
          if (menuItem) {
            menuItem.style.display = 'flex';
          }
        }
      });

      // Show a "Shared Access" badge in the header
      const headerRight = document.querySelector('.header-right');
      if (headerRight) {
        const badge = document.createElement('div');
        badge.innerHTML = `<span style="background:#fef3c7;color:#92400e;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;border:1px solid #fcd34d;"><i class="fas fa-lock" style="margin-right:5px;"></i>Limited Access</span>`;
        headerRight.prepend(badge);
      }
    }

    async function showManageSharedAdmins() {
      var modal = document.getElementById('manageSharedAdminsModal');
      var listDiv = document.getElementById('sharedAdminsList');
      listDiv.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px"><i class="fas fa-spinner fa-spin"></i> Loading...</p>';
      modal.classList.add('active');

      try {
        var snapshot = await database.ref('sharedAdmins').once('value');
        var sharedAdmins = snapshot.val() || {};
        var entries = Object.entries(sharedAdmins);

        if (!entries.length) {
          listDiv.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px;">No shared admins yet. Click Share Access to add one.</p>';
          return;
        }

        listDiv.innerHTML = entries.map(function(entry) {
          var id = entry[0], data = entry[1];
          var email = data.email || data.recipientEmail || data.grantedTo || 'Email not saved';
          var firstName = email !== 'Email not saved' ? email.split('@')[0] : '?';
          var isActive = data.status === 'active';
          var created = data.createdAt ? new Date(data.createdAt).toLocaleDateString('en-IN') : 'N/A';
          var lastSeen = data.lastAccessed ? new Date(data.lastAccessed).toLocaleDateString('en-IN') : 'Never accessed';
          var perms = data.permissions || [];

          return '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:12px;">'
            + '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">'
            + '<div style="flex:1;min-width:200px;">'
            + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">'
            + '<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#2563eb,#7c3aed);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:15px;flex-shrink:0;">' + firstName.charAt(0).toUpperCase() + '</div>'
            + '<div>'
            + '<div style="font-weight:800;font-size:14px;color:#0f172a;">' + email + '</div>'
            + '<div style="font-size:11px;color:#64748b;">Created: ' + created + ' &bull; ' + lastSeen + '</div>'
            + '</div></div>'
            + '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">'
            + perms.map(function(p){ return '<span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">' + p + '</span>'; }).join('')
            + '</div>'
            + '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;' + (isActive ? 'background:#dcfce7;color:#15803d' : 'background:#fee2e2;color:#dc2626') + '">'
            + '<i class="fas fa-circle" style="font-size:6px;"></i> ' + (isActive ? 'ACTIVE' : 'SUSPENDED')
            + '</span></div>'
            + '<div style="display:flex;flex-direction:column;gap:6px;">'
            + '<button onclick="viewSharedAdminActivity(\'' + id + '\',\'' + email.replace(/'/g, '') + '\')" style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;font-weight:600;">📊 Activity</button>'
            + (isActive
              ? '<button onclick="suspendSharedAdmin(' + JSON.stringify(id) + ')" style="background:#fff7ed;color:#ea580c;border:1px solid #fed7aa;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;font-weight:600;">🚫 Suspend</button>'
              : '<button onclick="activateSharedAdmin(' + JSON.stringify(id) + ')" style="background:#f0fdf4;color:#16a34a;border:1px solid #86efac;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;font-weight:600;">✅ Activate</button>')
            + '<button onclick="deleteSharedAdmin(' + JSON.stringify(id) + ')" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;font-weight:600;">🗑️ Delete</button>'
            + '</div></div></div>';
        }).join('');
      } catch(e) {
        listDiv.innerHTML = '<p style="color:#ef4444;text-align:center;padding:20px;">Error loading: ' + e.message + '</p>';
      }
    }

    async function suspendSharedAdmin(shareId) {
      if (!confirm('Suspend this admin? Access band ho jaayega. Unke products rahenge.')) return;
      try {
        await database.ref('sharedAdmins/' + shareId).update({ status: 'suspended' });
        showAdminToast('Admin suspend kar diya! Products safe hain.', 'success');
        asLoadAdmins();
      } catch(e) { showAdminToast('Error: ' + e.message, 'error'); }
    }

    async function activateSharedAdmin(shareId) {
      if (!confirm('Is admin ko activate karo?')) return;
      try {
        await database.ref('sharedAdmins/' + shareId).update({ status: 'active' });
        showAdminToast('Admin activate ho gaya!', 'success');
        asLoadAdmins();
      } catch(e) { showAdminToast('Error: ' + e.message, 'error'); }
    }

    async function deleteSharedAdmin(shareId) {
      if (!confirm('Permanently delete this shared admin? This cannot be undone.')) return;
      try {
        const snap = await database.ref('sharedAdmins/' + shareId + '/uid').once('value');
        if (snap.exists() && snap.val()) await database.ref('sharedAdminsByUid/' + snap.val()).remove().catch(()=>{});
        await database.ref('sharedAdmins/' + shareId).remove();
        await database.ref('sharedAdminLogs/' + shareId).remove().catch(()=>{});
        showAdminToast('Admin deleted successfully!', 'success');
        asLoadAdmins();
      } catch(e) { showAdminToast('Error deleting: ' + e.message, 'error'); }
    }

    function showAdminSharingOptions() {}

    // ===== NEW ADMIN SHARING SYSTEM =====
    function asOpenSharing() {
      document.getElementById('as-landing').style.display = 'none';
      document.getElementById('as-sharing-page').style.display = 'block';
      document.getElementById('as-manage-page').style.display = 'none';
      document.getElementById('as-email').value = '';
      document.getElementById('as-link-result').style.display = 'none';
      document.getElementById('as-perm-all').checked = false;
      document.querySelectorAll('[id^="asp-"]').forEach(cb => cb.checked = false);
      document.getElementById('as-gen-btn').innerHTML = '<i class="fas fa-paper-plane"></i> Link Generate Karo & Email Bhejo';
      document.getElementById('as-gen-btn').disabled = false;
    }

    function asOpenManage() {
      document.getElementById('as-landing').style.display = 'none';
      document.getElementById('as-sharing-page').style.display = 'none';
      document.getElementById('as-manage-page').style.display = 'block';
      asLoadAdmins();
    }

    function asBack() {
      document.getElementById('as-landing').style.display = 'flex';
      document.getElementById('as-sharing-page').style.display = 'none';
      document.getElementById('as-manage-page').style.display = 'none';
    }

    function asToggleAll() {
      const all = document.getElementById('as-perm-all').checked;
      document.querySelectorAll('[id^="asp-"]').forEach(cb => cb.checked = all);
    }

    function asGenerateLink() {
      const email = document.getElementById('as-email').value.trim();
      if (!email) { showAdminToast('Gmail address daalo', 'error'); return; }
      const perms = [];
      document.querySelectorAll('[id^="asp-"]:checked').forEach(cb => perms.push(cb.value));
      if (!perms.length) { showAdminToast('Kam se kam ek permission select karo', 'error'); return; }
      const btn = document.getElementById('as-gen-btn');
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
      btn.disabled = true;
      const shareId = 'share_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const creator = auth.currentUser ? auth.currentUser.email : 'super-admin';
      const shareData = { email, permissions: perms, status: 'active', createdBy: creator, createdAt: Date.now(), lastAccessed: null };
      database.ref('sharedAdmins/' + shareId).set(shareData).then(() => {
        const link = window.location.origin + window.location.pathname + '?share=' + shareId;
        document.getElementById('as-generated-link').value = link;
        document.getElementById('as-link-result').style.display = 'block';
        btn.innerHTML = '<i class="fas fa-check-circle"></i> Link Generated!';
        btn.disabled = false;
        showAdminToast('✅ Admin access link generate ho gaya!', 'success');
        const pLabels = {products:'Products',categories:'Categories',orders:'Orders',offers:'Offers',banners:'Banners',trending:'Trending',similar:'Similar Products',reviews:'Reviews',notifications:'Notifications',searchTags:'Search Tags',popularSearches:'Popular Searches',customers:'Customers',policies:'Policies',sellerRequests:'Seller Requests',hero:'Hero Section',userListings:'User Listings',brands:'Brands',analytics:'Analytics'};
        const permNames = perms.map(p => '• ' + (pLabels[p] || p)).join('\n');
        const subject = 'Admin Panel Access — Buyzo Cart';
        const body = 'Namaste,\n\nAapko Buyzo Cart Admin Panel ka limited access diya gaya hai.\n\n🔗 Access Link:\n' + link + '\n\n✅ Aapki Permissions:\n' + permNames + '\n\n📌 Note: Yeh link sirf aapke liye hai. Kisi aur ke saath share mat karein.\n\n— Buyzo Cart Admin Team';
        setTimeout(() => { window.location.href = 'mailto:' + encodeURIComponent(email) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body); }, 600);
      }).catch(err => {
        showAdminToast('Error: ' + err.message, 'error');
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Link Generate Karo & Email Bhejo';
        btn.disabled = false;
      });
    }

    function asCopyLink() {
      const input = document.getElementById('as-generated-link');
      if (!input.value) return;
      navigator.clipboard ? navigator.clipboard.writeText(input.value).then(() => showAdminToast('Link copy ho gaya!', 'success'))
        : (input.select(), document.execCommand('copy'), showAdminToast('Link copy ho gaya!', 'success'));
    }

    function asResendEmail() {
      const email = document.getElementById('as-email').value.trim();
      const link = document.getElementById('as-generated-link').value;
      if (!link) return;
      const subject = 'Admin Panel Access — Buyzo Cart';
      const body = 'Namaste,\n\nAapko Buyzo Cart Admin Panel ka limited access diya gaya hai.\n\n🔗 Access Link:\n' + link + '\n\n— Buyzo Cart Admin Team';
      window.location.href = 'mailto:' + encodeURIComponent(email) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    }

    async function asLoadAdmins() {
      const list = document.getElementById('as-admins-list');
      list.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:50px;"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i></p>';
      try {
        const snap = await database.ref('sharedAdmins').once('value');
        const data = snap.val() || {};
        const entries = Object.entries(data);
        if (!entries.length) {
          list.innerHTML = '<div style="text-align:center;padding:60px 20px;"><i class="fas fa-users-slash" style="font-size:48px;color:#cbd5e1;margin-bottom:16px;display:block;"></i><h3 style="color:#64748b;margin-bottom:8px;">Koi Shared Admin Nahi</h3><p style="color:#94a3b8;font-size:14px;">Admin Sharing card se naya admin add karo.</p></div>';
          return;
        }
        const pLabels = {products:'Products',categories:'Categories',orders:'Orders',offers:'Offers',banners:'Banners',trending:'Trending',similar:'Similar Products',reviews:'Reviews',notifications:'Notifications',searchTags:'Search Tags',popularSearches:'Popular Searches',customers:'Customers',policies:'Policies',sellerRequests:'Seller Requests',hero:'Hero Section',userListings:'User Listings',brands:'Brands',analytics:'Analytics'};
        list.innerHTML = entries.map(([id, d]) => {
          const email = d.email || 'Email not saved';
          const letter = email.charAt(0).toUpperCase();
          const isActive = d.status === 'active';
          const isSuspended = d.status === 'suspended';
          const created = d.createdAt ? new Date(d.createdAt).toLocaleDateString('en-IN') : 'N/A';
          const lastSeen = d.lastAccessed ? new Date(d.lastAccessed).toLocaleString('en-IN') : 'Never accessed';
          const perms = (d.permissions || []).map(p => pLabels[p] || p);
          const avatarBg = isActive ? 'linear-gradient(135deg,#2563eb,#7c3aed)' : 'linear-gradient(135deg,#94a3b8,#64748b)';
          const safeId = id.replace(/'/g, "\\'");
          const safeEmail = email.replace(/'/g, "\\'");
          return `<div style="background:white;border:1.5px solid ${isActive ? '#e2e8f0' : '#fca5a5'};border-radius:16px;padding:20px;margin-bottom:16px;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
              <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:200px;">
                <div style="width:48px;height:48px;border-radius:14px;background:${avatarBg};display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:20px;flex-shrink:0;">${letter}</div>
                <div>
                  <div style="font-weight:800;font-size:15px;color:#0f172a;">${email}</div>
                  <div style="font-size:11px;color:#94a3b8;margin-top:2px;">Added: ${created} · Last seen: ${lastSeen}</div>
                  <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;">
                    ${perms.slice(0,4).map(p => `<span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;">${p}</span>`).join('')}
                    ${perms.length > 4 ? `<span style="background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;">+${perms.length-4} more</span>` : ''}
                  </div>
                </div>
              </div>
              <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;flex-shrink:0;${isActive ? 'background:#dcfce7;color:#15803d' : 'background:#fee2e2;color:#dc2626'}">
                <i class="fas fa-circle" style="font-size:6px;"></i> ${isActive ? 'ACTIVE' : 'SUSPENDED'}
              </span>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid #f1f5f9;">
              <button onclick="viewSharedAdminActivity('${safeId}','${safeEmail}')" style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:8px;padding:7px 14px;cursor:pointer;font-size:12px;font-weight:700;"><i class="fas fa-chart-line"></i> Activity</button>
              ${isActive
                ? `<button onclick="suspendSharedAdmin('${safeId}')" style="background:#fff7ed;color:#ea580c;border:1px solid #fed7aa;border-radius:8px;padding:7px 14px;cursor:pointer;font-size:12px;font-weight:700;"><i class="fas fa-ban"></i> Suspend</button>`
                : `<button onclick="activateSharedAdmin('${safeId}')" style="background:#f0fdf4;color:#16a34a;border:1px solid #86efac;border-radius:8px;padding:7px 14px;cursor:pointer;font-size:12px;font-weight:700;"><i class="fas fa-check-circle"></i> Activate</button>`
              }
              ${isSuspended ? `<button onclick="asOpenTransfer('${safeId}','${safeEmail}')" style="background:#fef9c3;color:#ca8a04;border:1px solid #fde047;border-radius:8px;padding:7px 14px;cursor:pointer;font-size:12px;font-weight:700;"><i class="fas fa-exchange-alt"></i> Transfer</button>` : ''}
              <button onclick="asDeleteAdmin('${safeId}','${safeEmail}')" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:8px;padding:7px 14px;cursor:pointer;font-size:12px;font-weight:700;"><i class="fas fa-trash-alt"></i> Delete</button>
            </div>
          </div>`;
        }).join('');
      } catch(e) {
        list.innerHTML = `<p style="color:#ef4444;text-align:center;padding:20px;">Error: ${e.message}</p>`;
      }
    }

    function asOpenTransfer(shareId, email) {
      document.getElementById('as-transfer-id').value = shareId;
      document.getElementById('as-transfer-from-label').textContent = 'Transferring from: ' + email;
      document.getElementById('as-transfer-email').value = '';
      document.getElementById('as-transfer-modal').classList.add('active');
    }

    async function asExecuteTransfer() {
      const shareId = document.getElementById('as-transfer-id').value;
      const newEmail = document.getElementById('as-transfer-email').value.trim();
      if (!newEmail || !newEmail.includes('@')) { showAdminToast('Valid Gmail address daalo', 'error'); return; }
      if (!confirm('Admin access "' + newEmail + '" ko transfer karo? Purana admin remove ho jaayega.')) return;
      try {
        const snap = await database.ref('sharedAdmins/' + shareId).once('value');
        const existing = snap.val() || {};
        const newShareId = 'share_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        await database.ref('sharedAdmins/' + newShareId).set(Object.assign({}, existing, {
          email: newEmail, status: 'active',
          transferredFrom: existing.email || '', transferredAt: Date.now(),
          createdAt: Date.now(), lastAccessed: null
        }));
        await database.ref('sharedAdmins/' + shareId).remove();
        closeModal('as-transfer-modal');
        showAdminToast('✅ Admin access "' + newEmail + '" ko transfer ho gaya!', 'success');
        const link = window.location.origin + window.location.pathname + '?share=' + newShareId;
        const subject = 'Admin Panel Access Transferred — Buyzo Cart';
        const body = 'Namaste,\n\nBuyzo Cart Admin Panel access aapko transfer kiya gaya hai.\n\n🔗 Access Link:\n' + link + '\n\n— Buyzo Cart Admin Team';
        setTimeout(() => { window.location.href = 'mailto:' + encodeURIComponent(newEmail) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body); }, 500);
        asLoadAdmins();
      } catch(e) { showAdminToast('Error: ' + e.message, 'error'); }
    }

    async function asDeleteAdmin(shareId, email) {
      if (!confirm('"' + email + '" ko delete karo?\n\nOK = Delete admin')) return;
      const delProds = confirm('Kya unke add kiye hue products bhi delete karein?\n\nOK = Haan, products bhi delete karo\nCancel = Nahi, products rakhein');
      try {
        if (delProds) {
          const logSnap = await database.ref('sharedAdminLogs/' + shareId).once('value');
          const logs = logSnap.val() || {};
          const pids = new Set(Object.values(logs).filter(l => l.productId).map(l => l.productId));
          for (const pid of pids) await database.ref('products/' + pid).remove().catch(() => {});
        }
        const uidSnap = await database.ref('sharedAdmins/' + shareId + '/uid').once('value').catch(()=>null);
        if (uidSnap && uidSnap.exists()) await database.ref('sharedAdminsByUid/' + uidSnap.val()).remove().catch(()=>{});
        await database.ref('sharedAdmins/' + shareId).remove();
        await database.ref('sharedAdminLogs/' + shareId).remove().catch(() => {});
        showAdminToast('Admin delete ho gaya' + (delProds ? ' aur unke products bhi!' : '!'), 'success');
        asLoadAdmins();
      } catch(e) { showAdminToast('Error: ' + e.message, 'error'); }
    }

    // ===== SHARED ADMIN ACTIVITY =====
    async function viewSharedAdminActivity(shareId, email) {
      window._currentActivityEmail = email || '';
      document.getElementById('activityModalTitle').textContent = 'Activity — ' + (email || 'Shared Admin');
      document.getElementById('activityModalEmail').textContent = email || '';
      document.getElementById('activityLogList').innerHTML = '<p style="color:#94a3b8;text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading...</p>';
      document.getElementById('activityPermsList').innerHTML = '';
      const shareLink = window.location.origin + window.location.pathname + '?share=' + shareId;
      document.getElementById('activityShareLinkInput').value = shareLink;
      window._currentActivityLink = shareLink;
      document.getElementById('sharedAdminActivityModal').classList.add('active');
      try {
        const snap = await database.ref('sharedAdmins/' + shareId).once('value');
        const shareData = snap.val() || {};
        const perms = shareData.permissions || [];
        const permLabels = { dashboard:'Dashboard', products:'Products', categories:'Categories', orders:'Orders', offers:'Offers', banners:'Banners', trending:'Trending', similar:'Similar Products', reviews:'Reviews', notifications:'Notifications', searchTags:'Search Tags', popularSearches:'Popular Searches', customers:'Customers', policies:'Policies', sellerRequests:'Seller Requests', hero:'Hero Section', userListings:'User Listing', brands:'Brands', brandRequests:'Brand Requests', settings:'Settings', analytics:'Analytics' };
        // Store shareId for chip clicks
        window._currentActivityShareId = shareId;
        window._currentActivityPerms = perms;
        document.getElementById('activityPermsList').innerHTML = perms.length
          ? perms.map(p => {
              const label = permLabels[p] || p;
              const hasDetail = ['products','categories','orders','customers','banners','offers','reviews','brands'].includes(p);
              return '<span onclick="' + (hasDetail ? 'showPermDetails(\'' + p + '\',\'' + shareId + '\')' : '') + '" style="background:#dbeafe;color:#1d4ed8;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;' + (hasDetail ? 'cursor:pointer;' : '') + '" ' + (hasDetail ? 'title="Click to view ' + label + '"' : '') + '>' + label + (hasDetail ? ' 🔍' : '') + '</span>';
            }).join('')
          : '<span style="color:#94a3b8;font-size:12px;">No permissions assigned</span>';

        const logSnap = await database.ref('sharedAdminLogs/' + shareId).orderByChild('timestamp').limitToLast(100).once('value');
        const logs = [];
        logSnap.forEach(child => logs.unshift(child.val()));

        if (!logs.length) {
          document.getElementById('activityLogList').innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8;"><i class="fas fa-inbox" style="font-size:32px;margin-bottom:12px;display:block;"></i>Abhi tak koi activity nahi hui.<br><span style="font-size:12px;">Jab shared admin panel use karega, activities yahan dikhenge.</span></div>';
          return;
        }
        const iconMap = { product_add:'📦', product_delete:'🗑️', product_edit:'✏️', category_add:'🏷️', order_update:'📋', banner_add:'🖼️', offer_add:'🎁', review_action:'⭐', notification_send:'🔔', seller_approve:'✅', seller_reject:'❌', hero_update:'🏠', brand_blueTick:'🏆', login:'🔑' };
        document.getElementById('activityLogList').innerHTML = logs.map(log => {
          const t = new Date(log.timestamp);
          const timeStr = t.toLocaleDateString('en-IN') + ' ' + t.toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'});
          const icon = iconMap[log.type] || '📌';
          return '<div style="display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #f1f5f9;">'
            + '<div style="width:32px;height:32px;background:#f1f5f9;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">' + icon + '</div>'
            + '<div style="flex:1;">'
            + '<div style="font-weight:600;font-size:13px;color:#0f172a;">' + (log.description || log.type) + '</div>'
            + (log.detail ? '<div style="font-size:11px;color:#64748b;margin-top:2px;">' + log.detail + '</div>' : '')
            + '<div style="font-size:10px;color:#94a3b8;margin-top:3px;"><i class="fas fa-clock" style="margin-right:3px;"></i>' + timeStr + '</div>'
            + '</div>'
            + (log.productId ? '<button onclick="deleteProductFromActivity(\'' + log.productId + '\',this)" style="background:#fee2e2;color:#dc2626;border:none;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:10px;font-weight:600;flex-shrink:0;">Delete</button>' : '')
            + '</div>';
        }).join('');
      } catch(e) {
        document.getElementById('activityLogList').innerHTML = '<p style="color:#ef4444;text-align:center;padding:20px;">Error: ' + e.message + '</p>';
      }
    }

    async function showPermDetails(perm, shareId) {
      const labels = { products:'Products', categories:'Categories', orders:'Orders', customers:'Customers', banners:'Banners', offers:'Offers', reviews:'Reviews', brands:'Brands' };
      const label = labels[perm] || perm;
      const el = document.getElementById('activityLogList');
      el.innerHTML = '<p style="text-align:center;padding:20px;color:#94a3b8;"><i class="fas fa-spinner fa-spin"></i> Loading ' + label + '...</p>';
      try {
        let html = '<div style="margin-bottom:10px;display:flex;align-items:center;gap:8px;">'
          + '<button onclick="viewSharedAdminActivity(\'' + shareId + '\',\''  + (window._currentActivityEmail||'') + '\')" style="background:#f1f5f9;border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;font-weight:600;">← Back to Activity</button>'
          + '<span style="font-weight:700;font-size:14px;color:#0f172a;">' + label + '</span></div>';

        if (perm === 'products') {
          // Show products added by this shared admin (from logs)
          const logSnap = await database.ref('sharedAdminLogs/' + shareId).once('value');
          const pids = new Set();
          if (logSnap.exists()) logSnap.forEach(c => { if (c.val().productId && c.val().type === 'product_add') pids.add(c.val().productId); });
          if (!pids.size) { el.innerHTML = html + '<p style="text-align:center;color:#94a3b8;padding:20px;">Koi product add nahi kiya</p>'; return; }
          const prods = [];
          for (const pid of pids) {
            const ps = await database.ref('products/' + pid).once('value');
            if (ps.exists()) prods.push(ps.val());
          }
          html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' + prods.map(p => {
            const img = (p.images && p.images[0]) || p.image || '';
            return '<div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#fff;">'
              + (img ? '<img src="' + img + '" style="width:100%;height:70px;object-fit:cover;">' : '<div style="height:60px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:20px;">📦</div>')
              + '<div style="padding:8px;"><div style="font-size:12px;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (p.title||p.name||'Product') + '</div>'
              + '<div style="font-size:12px;color:#2563eb;font-weight:700;">₹' + (p.price||0) + '</div></div></div>';
          }).join('') + '</div>';
        } else if (perm === 'orders') {
          const snap = await database.ref('orders').limitToLast(20).once('value');
          const orders = []; if (snap.exists()) snap.forEach(c => orders.unshift({id: c.key, ...c.val()}));
          html += orders.length ? '<div style="font-size:12px;color:#64748b;margin-bottom:8px;">Last 20 orders shown</div>'
            + orders.map(o => '<div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin-bottom:6px;background:#fff;">'
              + '<div style="font-weight:700;font-size:12px;">Order #' + (o.id||'').slice(-6) + ' — ₹' + (o.totalAmount||o.total||0) + '</div>'
              + '<div style="font-size:11px;color:#64748b;">' + (o.status||'pending') + ' • ' + new Date(o.orderDate||o.timestamp||0).toLocaleDateString('en-IN') + '</div>'
              + '</div>').join('') : '<p style="text-align:center;color:#94a3b8;padding:20px;">Koi order nahi</p>';
        } else if (perm === 'customers') {
          const snap = await database.ref('users').limitToLast(15).once('value');
          const users = []; if (snap.exists()) snap.forEach(c => users.unshift({uid: c.key, ...c.val()}));
          html += users.length ? users.map(u => '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9;">'
            + '<div style="width:32px;height:32px;background:#dbeafe;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:#1d4ed8;font-size:13px;">' + (u.displayName||u.email||'U')[0].toUpperCase() + '</div>'
            + '<div><div style="font-size:13px;font-weight:600;">' + (u.displayName||u.email||'User') + '</div>'
            + (u.username ? '<div style="font-size:11px;color:#2563eb;">@' + u.username + '</div>' : '')
            + '</div></div>').join('') : '<p style="text-align:center;color:#94a3b8;padding:20px;">Koi customer nahi</p>';
        } else {
          html += '<p style="text-align:center;color:#94a3b8;padding:20px;">' + label + ' ki details yahan dikhegi.</p>';
        }
        el.innerHTML = html;
        window._currentActivityEmail = window._currentActivityEmail || '';
      } catch(e) { el.innerHTML = '<p style="color:#ef4444;padding:20px;">Error: ' + e.message + '</p>'; }
    }

    function copyActivityLink() {
      const link = window._currentActivityLink || '';
      if (!link) return;
      navigator.clipboard ? navigator.clipboard.writeText(link).then(() => showAdminToast('Link copied!', 'success'))
        : (document.getElementById('activityShareLinkInput').select(), document.execCommand('copy'), showAdminToast('Link copied!', 'success'));
    }

    async function deleteProductFromActivity(productId, btn) {
      if (!confirm('Delete this product from the main panel?')) return;
      btn.disabled = true;
      try {
        await database.ref('products/' + productId).remove();
        showAdminToast('Product deleted!', 'success');
        btn.parentElement.style.opacity = '0.5';
        btn.textContent = 'Deleted';
      } catch(e) {
        showAdminToast('Error: ' + e.message, 'error');
        btn.disabled = false;
      }
    }

    function logSharedAdminActivity(type, description, detail, productId) {
      const shareId = sessionStorage.getItem('sharedAdminId');
      if (!shareId) return;
      const log = {
        type, description, detail: detail || '', timestamp: Date.now(),
        adminEmail: auth.currentUser ? auth.currentUser.email : (sessionStorage.getItem('sharedAdminEmail') || 'Shared Admin')
      };
      if (productId) log.productId = productId;
      // Write to sharedAdminLogs (per-admin log)
      database.ref('sharedAdminLogs/' + shareId).push(log).catch(() => {});
      // ALSO write to global activityLog so real admin can see it
      database.ref('activityLog').push(Object.assign({}, log, {
        source: 'shared_admin', shareId: shareId
      })).catch(() => {});
    }

    // ===== SEARCH TAG PRODUCT MANAGEMENT =====
    async function showTagProducts(tagId, tagName) {
      currentTagForProducts = tagId;
      document.getElementById('currentTagName').textContent = tagName;
      
      const tagProductsRef = database.ref(`tagProducts/${tagId}`);
      const snapshot = await tagProductsRef.once('value');
      const productIds = snapshot.val() || [];
      
      const productsRef = database.ref('products');
      const productsSnap = await productsRef.once('value');
      const productsData = productsSnap.val() || {};
      
      const productsGrid = document.getElementById('tagProductsList');
      
      if (productIds.length === 0) {
        productsGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--secondary);">No products in this tag</p>';
      } else {
        let html = '';
        for (const productId of productIds) {
          const product = Object.values(productsData).find(p => (p.id || p.key) === productId);
          if (product) {
            const images = product.images || [];
            const mainImage = images[0] || 'https://via.placeholder.com/150';
            html += `
              <div class="product-card" onclick="toggleProductSelection('${productId}')" id="product-${productId}">
                <img src="${mainImage}" onerror="this.src='https://via.placeholder.com/150'">
                <h4>${product.title || 'No Name'}</h4>
                <p>${product.category || 'Uncategorized'}</p>
                <p class="price">₹${product.price || 0}</p>
                <div style="margin-top: 5px;">
                  <input type="checkbox" class="product-select-checkbox" value="${productId}" onclick="event.stopPropagation()">
                </div>
              </div>
            `;
          }
        }
        productsGrid.innerHTML = html;
      }
      
      document.getElementById('tagProductsModal').classList.add('active');
    }

    function toggleProductSelection(productId) {
      const checkbox = document.querySelector(`#product-${productId} .product-select-checkbox`);
      if (checkbox) {
        checkbox.checked = !checkbox.checked;
      }
    }

    async function removeSelectedFromTag() {
      const selected = document.querySelectorAll('#tagProductsList .product-select-checkbox:checked');
      if (selected.length === 0) {
        alert('Please select products to remove');
        return;
      }
      
      if (!confirm(`Remove ${selected.length} product(s) from this tag?`)) return;
      
      const productIds = Array.from(selected).map(cb => cb.value);
      
      const tagProductsRef = database.ref(`tagProducts/${currentTagForProducts}`);
      const snapshot = await tagProductsRef.once('value');
      const currentProducts = snapshot.val() || [];
      
      const updatedProducts = currentProducts.filter(id => !productIds.includes(id));
      
      await tagProductsRef.set(updatedProducts);
      alert('Products removed from tag!');
      showTagProducts(currentTagForProducts, document.getElementById('currentTagName').textContent);
    }

    async function showAddProductsToTag() {
      document.getElementById('addToTagName').textContent = document.getElementById('currentTagName').textContent;
      
      const productsRef = database.ref('products');
      const snapshot = await productsRef.once('value');
      const productsData = snapshot.val() || {};
      
      allProductsCache = Object.entries(productsData).map(([key, value]) => ({
        id: value.id || key,
        ...value
      }));
      
      const tagProductsRef = database.ref(`tagProducts/${currentTagForProducts}`);
      const tagSnap = await tagProductsRef.once('value');
      const existingProducts = tagSnap.val() || [];
      
      displayProductsForTagAdd(allProductsCache, existingProducts);
      
      const categoriesRef = database.ref('categories');
      const catSnap = await categoriesRef.once('value');
      const categoriesData = catSnap.val() || {};
      const categories = Object.values(categoriesData);
      
      const categoryList = document.getElementById('categoryListForTag');
      categoryList.innerHTML = categories.map(cat => `
        <div class="category-chip" onclick="selectCategoryForAdd('${cat.name}')">
          ${cat.name}
        </div>
      `).join('');
      
      document.getElementById('addProductsToTagModal').classList.add('active');
    }

    function displayProductsForTagAdd(products, existingProducts = []) {
      const grid = document.getElementById('allProductsGrid');
      selectedProductsForTag.clear();
      
      const html = products.map(product => {
        const images = product.images || [];
        const mainImage = images[0] || 'https://via.placeholder.com/150';
        const isExisting = existingProducts.includes(product.id);
        
        return `
          <div class="product-card ${isExisting ? 'selected' : ''}" onclick="toggleAddProductSelection('${product.id}')" id="add-product-${product.id}">
            <img src="${mainImage}" onerror="this.src='https://via.placeholder.com/150'">
            <h4>${product.title || 'No Name'}</h4>
            <p>${product.category || 'Uncategorized'}</p>
            <p class="price">₹${product.price || 0}</p>
            ${isExisting ? '<span class="badge badge-success" style="margin-top: 5px; display: inline-block;">Already in tag</span>' : ''}
          </div>
        `;
      }).join('');
      
      grid.innerHTML = html || '<p style="grid-column: 1/-1; text-align: center;">No products found</p>';
    }

    function toggleAddProductSelection(productId) {
      const card = document.getElementById(`add-product-${productId}`);
      if (card.classList.contains('selected')) {
        card.classList.remove('selected');
        selectedProductsForTag.delete(productId);
      } else {
        if (card.querySelector('.badge-success')) {
          alert('This product is already in the tag');
          return;
        }
        card.classList.add('selected');
        selectedProductsForTag.add(productId);
      }
    }

    function filterProductsForTag() {
      const searchTerm = document.getElementById('productSearchForTag').value.toLowerCase();
      const filtered = allProductsCache.filter(p => 
        (p.title || '').toLowerCase().includes(searchTerm) ||
        (p.category || '').toLowerCase().includes(searchTerm)
      );
      
      database.ref(`tagProducts/${currentTagForProducts}`).once('value', snap => {
        displayProductsForTagAdd(filtered, snap.val() || []);
      });
    }

    function switchAddOption(option) {
      currentAddOption = option;
      
      document.querySelectorAll('.add-option-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.textContent.toLowerCase().includes(option)) {
          tab.classList.add('active');
        }
      });
      
      if (option === 'all') {
        document.getElementById('allProductsView').style.display = 'block';
        document.getElementById('categoriesView').style.display = 'none';
      } else {
        document.getElementById('allProductsView').style.display = 'none';
        document.getElementById('categoriesView').style.display = 'block';
      }
    }

    function selectCategoryForAdd(categoryName) {
      currentCategoryForAdd = categoryName;
      
      document.querySelectorAll('.category-chip').forEach(chip => {
        chip.classList.remove('active');
        if (chip.textContent.trim() === categoryName) {
          chip.classList.add('active');
        }
      });
      
      const categoryProducts = allProductsCache.filter(p => p.category === categoryName);
      displayCategoryProducts(categoryProducts);
    }

    async function displayCategoryProducts(products) {
      const grid = document.getElementById('categoryProductsGrid');
      
      const tagSnap = await database.ref(`tagProducts/${currentTagForProducts}`).once('value');
      const existingProducts = tagSnap.val() || [];
      
      const html = products.map(product => {
        const images = product.images || [];
        const mainImage = images[0] || 'https://via.placeholder.com/150';
        const isExisting = existingProducts.includes(product.id);
        
        return `
          <div class="product-card ${isExisting ? 'selected' : ''}" onclick="toggleAddProductSelection('${product.id}')" id="add-product-${product.id}">
            <img src="${mainImage}" onerror="this.src='https://via.placeholder.com/150'">
            <h4>${product.title || 'No Name'}</h4>
            <p>${product.category || 'Uncategorized'}</p>
            <p class="price">₹${product.price || 0}</p>
            ${isExisting ? '<span class="badge badge-success" style="margin-top: 5px; display: inline-block;">Already in tag</span>' : ''}
          </div>
        `;
      }).join('');
      
      grid.innerHTML = html || '<p style="grid-column: 1/-1; text-align: center;">No products in this category</p>';
    }

    function filterCategoryProducts() {
      if (!currentCategoryForAdd) return;
      
      const searchTerm = document.getElementById('categoryProductSearch').value.toLowerCase();
      const categoryProducts = allProductsCache.filter(p => 
        p.category === currentCategoryForAdd &&
        ((p.title || '').toLowerCase().includes(searchTerm))
      );
      
      displayCategoryProducts(categoryProducts);
    }

    async function addSelectedToTag() {
      if (selectedProductsForTag.size === 0) {
        alert('Please select products to add');
        return;
      }
      
      const tagProductsRef = database.ref(`tagProducts/${currentTagForProducts}`);
      const snapshot = await tagProductsRef.once('value');
      const currentProducts = snapshot.val() || [];
      
      const newProducts = [...new Set([...currentProducts, ...Array.from(selectedProductsForTag)])];
      
      await tagProductsRef.set(newProducts);
      alert(`${selectedProductsForTag.size} product(s) added to tag!`);
      
      closeModal('addProductsToTagModal');
      showTagProducts(currentTagForProducts, document.getElementById('currentTagName').textContent);
    }

    // ===== LOAD CATEGORIES FOR DROPDOWN =====
    function loadCategoriesForDropdown() {
      const categoriesRef = database.ref('categories');
      categoriesRef.once('value', snapshot => {
        const categoriesData = snapshot.val();
        if (categoriesData) {
          allCategories = Object.entries(categoriesData).map(([key, value]) => {
            return { ...value, id: value.id || key };
          });
          updateCategoryDropdowns();
        }
      }).catch(error => {
        console.error('Error loading categories for dropdown:', error);
      });
    }

    function updateCategoryDropdowns() {
      const addProductCategory = document.getElementById('productCategory');
      if (addProductCategory) {
        const firstOption = addProductCategory.options[0];
        addProductCategory.innerHTML = '';
        if (firstOption) addProductCategory.appendChild(firstOption);
        
        allCategories.forEach(category => {
          if (category.status === 'active' || category.status === undefined) {
            const option = document.createElement('option');
            option.value = category.name;
            option.textContent = category.name;
            addProductCategory.appendChild(option);
          }
        });
      }
      
      const editProductCategory = document.getElementById('editProductCategory');
      if (editProductCategory) {
        const firstOption = editProductCategory.options[0];
        editProductCategory.innerHTML = '';
        if (firstOption) editProductCategory.appendChild(firstOption);
        
        allCategories.forEach(category => {
          if (category.status === 'active' || category.status === undefined) {
            const option = document.createElement('option');
            option.value = category.name;
            option.textContent = category.name;
            editProductCategory.appendChild(option);
          }
        });
      }
    }

    // ===== SHOW TAB =====
    function showTab(tabName) {
      // Block shared admins from accessing tabs they don't have permission for
      const sharedPermsRaw = sessionStorage.getItem('sharedPermissions');
      if (sharedPermsRaw) {
        const sharedPerms = JSON.parse(sharedPermsRaw);
        const tabMapping = {
          'products': 'products', 'categories': 'categories', 'banners': 'banners',
          'trending': 'trending', 'similar-products': 'similar', 'reviews': 'reviews',
          'notifications': 'notifications', 'search-tags': 'searchTags',
          'popular-searches': 'popularSearches', 'orders': 'orders',
          'offers': 'offers', 'customers': 'customers', 'policies': 'policies',
          'seller-requests': 'sellerRequests', 'hero': 'hero',
          'user-listings': 'userListings', 'brands': 'brands', 'brand-requests': 'brandRequests', 'analytics': 'analytics'
        };
        const requiredPerm = tabMapping[tabName];
        if (requiredPerm && !sharedPerms.includes(requiredPerm)) {
          alert('You do not have permission to access this section.');
          return;
        }
        // Completely block settings and admin-sharing for shared admins
        if (tabName === 'settings' || tabName === 'admin-sharing') {
          alert('You do not have permission to access this section.');
          return;
        }
      }

      if (tabName === 'admin-sharing') {
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.menu-item').forEach(nav => nav.classList.remove('active'));
        document.getElementById('admin-sharing').classList.add('active');
        document.querySelector('.menu-item[data-tab="admin-sharing"]').classList.add('active');
        document.getElementById('adminPageTitle').textContent = 'Admin Sharing';
        // Reset to landing page every time tab is opened
        document.getElementById('as-landing').style.display = 'flex';
        document.getElementById('as-sharing-page').style.display = 'none';
        document.getElementById('as-manage-page').style.display = 'none';
        currentAdminTab = 'admin-sharing';
        return;
      }
      
      document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
      document.querySelectorAll('.menu-item').forEach(nav => nav.classList.remove('active'));
      document.getElementById(tabName).classList.add('active');
      const navItem = document.querySelector(`.menu-item[data-tab="${tabName}"]`);
      if (navItem) navItem.classList.add('active');
      
      const titleMap = {
        'dashboard': 'Dashboard', 'products': 'Products', 'categories': 'Categories',
        'orders': 'Orders', 'offers': 'Offers', 'reviews': 'Reviews', 'notifications': 'Notifications',
        'trending': 'Trending Products', 'similar-products': 'Similar Products',
        'search-tags': 'Search Tags', 'popular-searches': 'Popular Searches',
        'customers': 'Customers', 'banners': 'Banners', 'policies': 'Policies', 'settings': 'Settings',
        'hero': '🏠 Hero Section', 'user-listings': '🏪 User Listings', 'analytics': '📊 Analytics',
        'seller-requests': '🧑‍💼 Seller Applications',
        'brands': '🏷️ Brands', 'brand-requests': '📬 Brand Requests'
      };
      document.getElementById('adminPageTitle').textContent = titleMap[tabName] || tabName;
      currentAdminTab = tabName;

      /* ── Auto-close sidebar on mobile after selecting a tab ── */
      if (window.innerWidth <= 1024) {
        closeSidebar();
      }
      
      if (tabName === 'dashboard') loadDashboardData();
      else if (tabName === 'products') loadProducts();
      else if (tabName === 'categories') loadCategories();
      else if (tabName === 'orders') loadOrders();
      else if (tabName === 'offers') loadOffers();
      else if (tabName === 'reviews') { _reviewFilter = 'pending'; loadAdminReviews(); }
      else if (tabName === 'notifications') loadNotifHistory();
      else if (tabName === 'trending') {
        loadTrendingProducts();
        // Auto-run once per session on first visit to trending tab
        if (!window._autoTrendRanThisSession) {
          window._autoTrendRanThisSession = true;
          runAutoTrending(false);
        }
      }
      else if (tabName === 'similar-products') loadSimilarProducts();
      else if (tabName === 'search-tags') loadSearchTags();
      else if (tabName === 'popular-searches') loadPopularSearches();
      else if (tabName === 'customers') loadCustomers();
      else if (tabName === 'banners') loadBanners();
      else if (tabName === 'policies') loadPolicies();
      else if (tabName === 'settings') { loadSettings(); adminLoad2FAStatus(); }
      else if (tabName === 'hero') { loadHeroSectionSettings(); }
      else if (tabName === 'user-listings') { loadUserListings(); }
      else if (tabName === 'analytics') { loadAnalytics(); }
      else if (tabName === 'seller-requests') { loadSellerRequests(); }
      else if (tabName === 'brands') { loadBrandsPanel(); }
      else if (tabName === 'brand-requests') { loadBrandRequests(); }
      else if (tabName === 'offers') { loadOffers(); }
    }

    function showPolicyTab(policy) {
      document.querySelectorAll('.tabs .tab').forEach(tab => tab.classList.remove('active'));
      document.querySelectorAll('.policy-content').forEach(content => content.classList.remove('active'));
      document.querySelector(`.tab[data-policy="${policy}"]`).classList.add('active');
      document.querySelector(`.policy-content[data-policy="${policy}"]`).classList.add('active');
    }

    // ===== LOAD SEARCH TAGS =====
    function loadSearchTags() {
      const searchTagsRef = database.ref('searchTags');
      searchTagsRef.off('value');
      searchTagsRef.on('value', snapshot => {
        const tagsData = snapshot.val();
        allSearchTags = [];

        if (tagsData) {
          allSearchTags = Object.entries(tagsData).map(([key, value]) => ({
            id: key,
            ...(typeof value === 'string' ? { name: value, type: 'general', active: true } : value)
          }));
        }

        // Also read from adminSettings/searchTags (real site path)
        database.ref('adminSettings/searchTags').once('value').then(aSnap => {
          if (aSnap.exists()) {
            const aData = aSnap.val();
            const existingNames = new Set(allSearchTags.map(t => (t.name||'').toLowerCase()));
            if (Array.isArray(aData)) {
              aData.forEach((tag, i) => {
                const name = typeof tag === 'string' ? tag : (tag.name || '');
                if (name && !existingNames.has(name.toLowerCase())) {
                  allSearchTags.push({ id: 'as_tag_' + i, name, type: 'general', active: true, _fromSettings: true });
                }
              });
            } else if (typeof aData === 'string') {
              aData.split(',').map(s => s.trim()).filter(Boolean).forEach((name, i) => {
                if (!existingNames.has(name.toLowerCase())) {
                  allSearchTags.push({ id: 'as_tag_' + i, name, type: 'general', active: true, _fromSettings: true });
                }
              });
            }
          }

          updateDashboardSearchTags();
          const tagsList = document.getElementById('searchTagsList');
          if (tagsList) {
            if (allSearchTags.length === 0) {
              tagsList.innerHTML = '<p style="color: var(--secondary);">No search tags added yet.</p>';
            } else {
              tagsList.innerHTML = allSearchTags.map(tag => `
                <div class="tag-item" onclick="showTagProducts('${tag.id}', '${(tag.name||'').replace(/'/g,"\\'")}')">
                  <span>${tag.name || ''}</span>
                  <span class="badge badge-info" style="margin-left: 8px;">${tag.type || 'general'}</span>
                  ${tag._fromSettings ? '<span class="badge" style="background:#fef9c3;color:#92400e;margin-left:4px;font-size:10px;">Settings</span>' : ''}
                  <i class="fas fa-times remove-tag" onclick="event.stopPropagation(); deleteSearchTag('${tag.id}')"></i>
                </div>
              `).join('');
            }
          }
        }).catch(() => {
          updateDashboardSearchTags();
          const tagsList = document.getElementById('searchTagsList');
          if (tagsList) {
            if (allSearchTags.length === 0) {
              tagsList.innerHTML = '<p style="color: var(--secondary);">No search tags added yet.</p>';
            } else {
              tagsList.innerHTML = allSearchTags.map(tag => `
                <div class="tag-item" onclick="showTagProducts('${tag.id}', '${(tag.name||'').replace(/'/g,"\\'")}')">
                  <span>${tag.name || ''}</span>
                  <span class="badge badge-info" style="margin-left: 8px;">${tag.type || 'general'}</span>
                  <i class="fas fa-times remove-tag" onclick="event.stopPropagation(); deleteSearchTag('${tag.id}')"></i>
                </div>
              `).join('');
            }
          }
        });
      });
    }

    // Load Popular Searches
    function loadPopularSearches() {
      const popularSearchesRef = database.ref('popularSearches');
      popularSearchesRef.off('value');
      popularSearchesRef.on('value', snapshot => {
        const searchesData = snapshot.val();
        allPopularSearches = [];

        if (searchesData) {
          allPopularSearches = Object.entries(searchesData).map(([key, value]) => ({
            id: key,
            ...(typeof value === 'string' ? { term: value, count: 1, active: true } : value)
          }));
          allPopularSearches.sort((a, b) => (b.count || 0) - (a.count || 0));
        }

        // Also read from adminSettings/popularSearches (real site path)
        database.ref('adminSettings/popularSearches').once('value').then(aSnap => {
          if (aSnap.exists()) {
            const aData = aSnap.val();
            const existingTerms = new Set(allPopularSearches.map(s => (s.term||'').toLowerCase()));
            const addTerms = (items) => {
              if (Array.isArray(items)) {
                items.forEach((item, i) => {
                  const term = typeof item === 'string' ? item : (item.term || item.name || '');
                  const count = typeof item === 'object' ? (item.count || 1) : 1;
                  if (term && !existingTerms.has(term.toLowerCase())) {
                    allPopularSearches.push({ id: 'as_ps_' + i, term, count, active: true, _fromSettings: true });
                  }
                });
              } else if (typeof items === 'string') {
                items.split(',').map(s => s.trim()).filter(Boolean).forEach((term, i) => {
                  if (!existingTerms.has(term.toLowerCase())) {
                    allPopularSearches.push({ id: 'as_ps_' + i, term, count: 1, active: true, _fromSettings: true });
                  }
                });
              }
            };
            addTerms(aData);
            allPopularSearches.sort((a, b) => (b.count || 0) - (a.count || 0));
          }

          updateDashboardPopularSearches();
          renderPopularSearchesList();
        }).catch(() => {
          updateDashboardPopularSearches();
          renderPopularSearchesList();
        });
      });
    }

    function renderPopularSearchesList() {
      const searchesList = document.getElementById('popularSearchesList');
      if (!searchesList) return;
      if (allPopularSearches.length === 0) {
        searchesList.innerHTML = '<p style="color: var(--secondary);">No popular searches added yet.</p>';
      } else {
        searchesList.innerHTML = allPopularSearches.map(search => `
          <div class="popular-search-item">
            <span>${search.term || ''}</span>
            <span class="badge badge-success" style="margin-left: 8px;">${search.count || 0} searches</span>
            ${search._fromSettings ? '<span class="badge" style="background:#fef9c3;color:#92400e;margin-left:4px;font-size:10px;">Settings</span>' : ''}
            <i class="fas fa-times remove-tag" onclick="deletePopularSearch('${search.id}')"></i>
          </div>
        `).join('');
      }
    }

    function updateDashboardSearchTags() {
      const dashboardTags = document.getElementById('dashboardSearchTags');
      if (dashboardTags) {
        const topTags = allSearchTags.slice(0, 10);
        dashboardTags.innerHTML = topTags.map(tag => `
          <div class="tag-item" onclick="showTab('search-tags')">
            <span>${tag.name}</span>
          </div>
        `).join('');
        
        if (topTags.length === 0) {
          dashboardTags.innerHTML = '<p style="color: var(--secondary);">No search tags</p>';
        }
      }
    }

    function updateDashboardPopularSearches() {
      const dashboardPopular = document.getElementById('dashboardPopularSearches');
      if (dashboardPopular) {
        const topSearches = allPopularSearches.slice(0, 10);
        dashboardPopular.innerHTML = topSearches.map(search => `
          <div class="popular-search-item" onclick="showTab('popular-searches')">
            <span>${search.term}</span>
            <span class="badge badge-success" style="margin-left: 8px;">${search.count || 0}</span>
          </div>
        `).join('');
        
        if (topSearches.length === 0) {
          dashboardPopular.innerHTML = '<p style="color: var(--secondary);">No popular searches</p>';
        }
      }
    }

    // Load dashboard data
    function loadDashboardData() {
      const ordersRef   = database.ref('orders');
      const productsRef = database.ref('products');
      const usersRef    = database.ref('users');

      // Show loading state
      ['totalProducts','totalOrders','pendingOrders','trendingProducts','totalCustomersStat'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '...';
      });

      Promise.all([
        ordersRef.once('value'),
        productsRef.once('value'),
        usersRef.once('value')
      ]).then(([ordersSnap, productsSnap, usersSnap]) => {
        // Safely handle null values
        const ordersData   = ordersSnap.val()   || {};
        const productsData = productsSnap.val() || {};
        const usersData    = usersSnap.val()    || {};

        const orders   = Object.entries(ordersData).map(([key, val]) => ({ ...val, id: key }));
        const products = Object.entries(productsData)
          .map(([key, val]) => ({ ...val, id: key }))
          .filter(p => p.status !== 'inactive'); // exclude removed listings
        const totalCustomers = Object.keys(usersData).length;

        const trendingCount = products.filter(p => p.isTrending || p.trending || p.autoTrending).length;
        const pendingCount  = orders.filter(o => {
          const s = (o.status || '').toLowerCase();
          return s === 'confirmed' || s === 'pending';
        }).length;

        // Update stat cards
        const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setEl('totalProducts',     products.length);
        setEl('totalOrders',       orders.length);
        setEl('pendingOrders',     pendingCount);
        setEl('trendingProducts',  trendingCount);
        setEl('totalCustomersStat', totalCustomers);

        // Load pending brand requests count
        database.ref('brandRequests').once('value').then(brSnap => {
          let pendingBrands = 0;
          if (brSnap.exists()) {
            brSnap.forEach(c => { if ((c.val().status || 'pending') === 'pending') pendingBrands++; });
          }
          setEl('pendingBrandReqs', pendingBrands);
        }).catch(() => setEl('pendingBrandReqs', '—'));

        // Load pending seller requests count
        database.ref('sellerRequests').once('value').then(srSnap => {
          let pendingSellers = 0;
          if (srSnap.exists()) {
            srSnap.forEach(c => {
              const d = c.val();
              if (d && (d.status === 'pending' || !d.status)) pendingSellers++;
            });
          }
          setEl('pendingSellerReqs', pendingSellers);
        }).catch(() => {
          // Retry once after short delay
          setTimeout(() => {
            database.ref('sellerRequests').once('value').then(srSnap => {
              let pendingSellers = 0;
              if (srSnap.exists()) {
                srSnap.forEach(c => { const d = c.val(); if (d && (d.status === 'pending' || !d.status)) pendingSellers++; });
              }
              setEl('pendingSellerReqs', pendingSellers);
            }).catch(() => setEl('pendingSellerReqs', 0));
          }, 2000);
        });

        // Earnings
        const totalEarnings = orders.reduce((sum, o) => sum + (parseFloat(o.totalAmount) || 0), 0);
        const now       = Date.now();
        const weekAgo   = now - 7  * 24 * 3600000;
        const monthAgo  = now - 30 * 24 * 3600000;
        const weekEarnings  = orders.filter(o => (o.orderDate || 0) >= weekAgo) .reduce((s, o) => s + (parseFloat(o.totalAmount) || 0), 0);
        const monthEarnings = orders.filter(o => (o.orderDate || 0) >= monthAgo).reduce((s, o) => s + (parseFloat(o.totalAmount) || 0), 0);

        setEl('totalEarnings',    '₹' + totalEarnings.toLocaleString('en-IN'));
        setEl('lastWeekEarnings', '₹' + weekEarnings.toLocaleString('en-IN'));
        setEl('lastMonthEarnings','₹' + monthEarnings.toLocaleString('en-IN'));

        // Recent orders table
        const recentOrders = [...orders].sort((a, b) => (b.orderDate || 0) - (a.orderDate || 0)).slice(0, 10);
        const statusColor = { confirmed:'#2563eb', shipped:'#f59e0b', delivered:'#22c55e', cancelled:'#ef4444', pending:'#94a3b8' };

        const recentOrdersHtml = recentOrders.length
          ? recentOrders.map(order => {
              const s    = (order.status || 'confirmed').toLowerCase();
              const name = order.userInfo?.fullName || order.username || 'N/A';
              const date = order.orderDate ? new Date(order.orderDate).toLocaleDateString('en-IN') : 'N/A';
              const color = statusColor[s] || '#94a3b8';
              return `<tr>
                <td style="font-weight:600;">${order.orderId || '#' + (order.id || '').slice(-6)}</td>
                <td>${name}<br><small style="color:#64748b;">${order.userEmail || ''}</small></td>
                <td>${order.productName || 'N/A'}</td>
                <td style="font-weight:600;">₹${(parseFloat(order.totalAmount) || 0).toLocaleString('en-IN')}</td>
                <td><span style="background:${color}20;color:${color};padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;">${order.status || 'Confirmed'}</span></td>
                <td>${date}</td>
              </tr>`;
            }).join('')
          : '<tr><td colspan="6" style="text-align:center;padding:24px;color:#94a3b8;">No orders yet</td></tr>';

        const recentEl = document.getElementById('recentOrders');
        if (recentEl) recentEl.innerHTML = recentOrdersHtml;

      }).catch(err => {
        console.error('Dashboard load error:', err);
        showAdminToast('Dashboard load failed: ' + err.message, 'error');
        // Show zeros instead of blank
        ['totalProducts','totalOrders','pendingOrders','trendingProducts','totalCustomersStat'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.textContent = '0';
        });
      });
    }

    // Load products
    function loadProducts() {
      const productsRef = database.ref('products');
      productsRef.once('value', snapshot => {
        const productsData = snapshot.val();
        let products = [];
        
        if (productsData) {
          products = Object.entries(productsData)
            .map(([key, value]) => ({ ...value, id: value.id || key }))
            // Exclude seller-added products — they go in User Listings
            .filter(p => p.source !== 'seller' && p.source !== 'user_listing');
        }
        
        const filteredProducts = filterProductsList(products);
        const totalPages = Math.ceil(filteredProducts.length / productsPerPage);
        
        updatePagination('productsPagination', currentProductsPage, totalPages, 'products');
        
        const startIndex = (currentProductsPage - 1) * productsPerPage;
        const paginatedProducts = filteredProducts.slice(startIndex, startIndex + productsPerPage);
        
        const productsHtml = paginatedProducts.map(product => {
          const images = product.images || [];
          const mainImage = images.length > 0 ? images[0] : '';
          
          return `
            <tr>
              <td><img src="${mainImage}" class="product-image" onerror="this.src='https://via.placeholder.com/50'"></td>
              <td>${product.title || 'No Name'}</td>
              <td>${product.category || 'Uncategorized'}</td>
              <td>₹${product.price || 0}</td>
              <td>${product.stock || 0}</td>
              <td>${product.trending ? '<span class="badge badge-success">Yes</span>' : '<span class="badge badge-warning">No</span>'}</td>
              <td>${product.status === 'active' ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Inactive</span>'}</td>
              <td>
                <div style="display: flex; gap: 8px;">
                  <button class="btn btn-primary btn-sm" onclick="editProduct('${product.id}')"><i class="fas fa-edit"></i></button>
                  <button class="btn btn-danger btn-sm" onclick="deleteProduct('${product.id}')"><i class="fas fa-trash"></i></button>
                </div>
              </td>
            </tr>
          `;
        }).join('');
        
        document.getElementById('productsTableBody').innerHTML = productsHtml || '<tr><td colspan="8" style="text-align: center">No products found</td></tr>';
      }).catch(error => {
        console.error('Error loading products:', error);
      });
    }

    function filterProductsList(products) {
      const searchTerm = document.getElementById('productSearch')?.value.toLowerCase() || '';
      return products.filter(product => 
        (product.title || '').toLowerCase().includes(searchTerm) || 
        (product.category || '').toLowerCase().includes(searchTerm) ||
        (product.desc || '').toLowerCase().includes(searchTerm)
      );
    }

    function filterProducts() {
      currentProductsPage = 1;
      loadProducts();
    }

    // Load categories
    function loadCategories() {
      const categoriesRef = database.ref('categories');
      categoriesRef.once('value', snapshot => {
        const categoriesData = snapshot.val();
        let categories = [];
        
        if (categoriesData) {
          categories = Object.entries(categoriesData).map(([key, value]) => ({
            ...value,
            id: value.id || key
          }));
        }
        
        allCategories = categories;
        updateCategoryDropdowns();
        
        const categoriesHtml = categories.map(category => `
          <tr>
            <td>#${category.id}</td>
            <td>
              ${category.image ? 
                `<img src="${category.image}" class="product-image" onerror="this.src='https://via.placeholder.com/50'">` : 
                '<div class="product-image" style="background: #f1f5f9; display: flex; align-items: center; justify-content: center;"><i class="fas fa-image"></i></div>'
              }
            </td>
            <td>${category.name || 'No Name'}</td>
            <td>${category.description || 'No description'}</td>
            <td>${category.productCount || 0}</td>
            <td>${category.status === 'active' ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Inactive</span>'}</td>
            <td>
              <div style="display: flex; gap: 8px;">
                <button class="btn btn-primary btn-sm" onclick="editCategory('${category.id}')"><i class="fas fa-edit"></i></button>
                <button class="btn btn-danger btn-sm" onclick="deleteCategory('${category.id}')"><i class="fas fa-trash"></i></button>
              </div>
            </td>
          </tr>
        `).join('');
        
        document.getElementById('categoriesTableBody').innerHTML = categoriesHtml || '<tr><td colspan="7" style="text-align: center">No categories found</td></tr>';
      }).catch(error => {
        console.error('Error loading categories:', error);
      });
    }

    // Load orders with date filter
    function loadOrders() {
      database.ref('orders').once('value').then(snap => {
        const ordersData = snap.val() || {};
        let orders = Object.entries(ordersData).map(([key, val]) => ({ ...val, id: key }));

        orders.sort((a, b) => (b.orderDate || 0) - (a.orderDate || 0));

        const searchTerm = (document.getElementById('orderSearch')?.value || '').toLowerCase();
        if (searchTerm) {
          orders = orders.filter(o =>
            (o.orderId || '').toLowerCase().includes(searchTerm) ||
            (o.userInfo?.fullName || o.username || '').toLowerCase().includes(searchTerm) ||
            (o.userInfo?.mobile || '').includes(searchTerm) ||
            (o.productName || '').toLowerCase().includes(searchTerm) ||
            (o.userEmail || '').toLowerCase().includes(searchTerm)
          );
        }

        if (currentDateFilter.type !== 'all') {
          const today = new Date(); today.setHours(0,0,0,0);
          orders = orders.filter(o => {
            if (!o.orderDate) return false;
            const d = new Date(o.orderDate); d.setHours(0,0,0,0);
            if (currentDateFilter.type === 'today') return d.getTime() === today.getTime();
            if (currentDateFilter.type === 'custom' && currentDateFilter.startDate && currentDateFilter.endDate) {
              const s = new Date(currentDateFilter.startDate); s.setHours(0,0,0,0);
              const e = new Date(currentDateFilter.endDate); e.setHours(23,59,59,999);
              return d >= s && d <= e;
            }
            return true;
          });
        }

        const totalPages = Math.ceil(orders.length / ordersPerPage);
        updatePagination('ordersPagination', currentOrdersPage, totalPages, 'orders');
        const startIndex = (currentOrdersPage - 1) * ordersPerPage;
        const paged = orders.slice(startIndex, startIndex + ordersPerPage);

        const statusColor = { confirmed:'#2563eb', shipped:'#f59e0b', delivered:'#22c55e', cancelled:'#ef4444', pending:'#94a3b8' };

        const html = paged.length ? paged.map(order => {
          const s = (order.status || 'confirmed').toLowerCase();
          const name = order.userInfo?.fullName || order.username || 'N/A';
          const mobile = order.userInfo?.mobile || 'N/A';
          const date = order.orderDate ? new Date(order.orderDate).toLocaleDateString('en-IN') : 'N/A';
          return `<tr>
            <td><input type="checkbox" value="${order.id}"></td>
            <td style="font-weight:600;">${order.orderId || '#' + order.id.slice(-6)}</td>
            <td>${name}<br><small style="color:#64748b;">${mobile}</small></td>
            <td>${order.productName || 'N/A'}<br><small>Qty: ${order.quantity||1} | Size: ${order.size||'N/A'}</small></td>
            <td style="font-weight:600;">₹${(order.totalAmount || 0).toLocaleString()}</td>
            <td>
              <select onchange="updateOrderStatus('${order.id}', this.value)" class="form-control" style="width:auto;min-width:130px;">
                <option value="confirmed" ${s==='confirmed'?'selected':''}>Confirmed</option>
                <option value="shipped" ${s==='shipped'?'selected':''}>Shipped</option>
                <option value="delivered" ${s==='delivered'?'selected':''}>Delivered</option>
                <option value="cancelled" ${s==='cancelled'?'selected':''}>Cancelled</option>
              </select>
            </td>
            <td>${date}</td>
            <td><button class="btn btn-primary btn-sm" onclick="viewOrderDetails('${order.id}')"><i class="fas fa-eye"></i></button></td>
          </tr>`;
        }).join('') : '<tr><td colspan="8" style="text-align:center;padding:20px;color:#94a3b8;">No orders found</td></tr>';

        document.getElementById('ordersTableBody').innerHTML = html;
      }).catch(err => console.error('Error loading orders:', err));
    }

    function filterOrdersByDate(type, button) {
      document.querySelectorAll('.date-filter-buttons .btn').forEach(btn => {
        btn.classList.remove('active');
      });
      button.classList.add('active');
      
      currentDateFilter.type = type;
      currentDateFilter.startDate = null;
      currentDateFilter.endDate = null;
      
      document.getElementById('startDate').value = '';
      document.getElementById('endDate').value = '';
      
      currentOrdersPage = 1;
      loadOrders();
    }

    function filterOrdersByCustomDate() {
      const startDate = document.getElementById('startDate').value;
      const endDate = document.getElementById('endDate').value;
      
      if (!startDate || !endDate) {
        alert('Please select both start and end dates');
        return;
      }
      
      document.querySelectorAll('.date-filter-buttons .btn').forEach(btn => {
        btn.classList.remove('active');
      });
      
      currentDateFilter.type = 'custom';
      currentDateFilter.startDate = startDate;
      currentDateFilter.endDate = endDate;
      
      currentOrdersPage = 1;
      loadOrders();
    }

    function clearDateFilter() {
      currentDateFilter.type = 'all';
      currentDateFilter.startDate = null;
      currentDateFilter.endDate = null;
      
      document.getElementById('startDate').value = '';
      document.getElementById('endDate').value = '';
      
      document.querySelectorAll('.date-filter-buttons .btn').forEach(btn => {
        btn.classList.remove('active');
      });
      document.querySelector('.date-filter-buttons .btn:first-child').classList.add('active');
      
      currentOrdersPage = 1;
      loadOrders();
    }

    function filterOrders() {
      currentOrdersPage = 1;
      loadOrders();
    }

    function updateOrderStatus(orderId, status) {
      const updates = { status };
      if (status === 'delivered') updates.deliveredDate = Date.now();
      database.ref('orders/' + orderId).update(updates)
        .then(() => {
          loadOrders();
          if (currentAdminTab === 'dashboard') loadDashboardData();
        })
        .catch(err => alert('Error updating status: ' + err.message));
    }

    function applyBulkAction() {
      const status = document.getElementById('bulkStatusAction').value;
      if (!status) {
        alert('Please select a status action');
        return;
      }
      
      const checkboxes = document.querySelectorAll('#ordersTableBody input[type="checkbox"]:checked');
      if (checkboxes.length === 0) {
        alert('Please select at least one order');
        return;
      }
      
      if (!confirm(`Update ${checkboxes.length} order(s) to ${status}?`)) return;
      
      const updates = {};
      checkboxes.forEach(checkbox => {
        updates[`orders/${checkbox.value}/status`] = status;
      });
      
      database.ref().update(updates)
        .then(() => {
          loadOrders();
          if (currentAdminTab === 'dashboard') loadDashboardData();
          document.getElementById('selectAllOrders').checked = false;
          alert('Bulk update successful!');
        })
        .catch(error => {
          console.error('Error in bulk update:', error);
          alert('Error updating orders');
        });
    }

    function viewOrderDetails(orderId) {
      database.ref('orders/' + orderId).once('value').then(snap => {
        const order = snap.val();
        if (!order) { alert('Order not found'); return; }

        const name = order.userInfo?.fullName || order.username || 'N/A';
        const mobile = order.userInfo?.mobile || 'N/A';
        const city = order.userInfo?.city || '';
        const state = order.userInfo?.state || '';
        const pincode = order.userInfo?.pincode || '';
        const house = order.userInfo?.house || '';
        const orderDate = order.orderDate ? new Date(order.orderDate) : new Date();

        document.getElementById('orderDetailsId').textContent = order.orderId || ('#' + orderId.slice(-8));
        document.getElementById('orderDetailsName').textContent = name;
        document.getElementById('orderDetailsMobile').textContent = mobile;
        document.getElementById('orderDetailsEmail').textContent = order.userEmail || 'N/A';
        document.getElementById('orderDetailsDate').textContent = orderDate.toLocaleString('en-IN');

        const address = [house, city, state, pincode].filter(Boolean).join(', ');
        document.getElementById('orderDetailsAddress').textContent = address || 'N/A';

        const qty = order.quantity || 1;
        const price = order.productPrice || 0;
        const subtotal = order.subtotal || (price * qty);
        document.getElementById('orderProductsBody').innerHTML = `
          <tr>
            <td>${order.productName || 'N/A'}</td>
            <td>₹${price.toLocaleString()}</td>
            <td>${qty} ${order.size ? '| Size: ' + order.size : ''}</td>
            <td>₹${subtotal.toLocaleString()}</td>
          </tr>`;

        document.getElementById('orderSubtotal').textContent = '₹' + subtotal.toLocaleString();
        document.getElementById('orderShipping').textContent = '₹' + (order.deliveryCharge || 50);
        document.getElementById('orderTotal').textContent = '₹' + (order.totalAmount || subtotal + 50).toLocaleString();

        const statusSelect = document.getElementById('orderDetailsStatus');
        statusSelect.value = order.status || 'confirmed';
        statusSelect.setAttribute('data-order-id', orderId);

        updateStatusTimeline(order.status || 'confirmed');
        document.getElementById('orderDetailsModal').classList.add('active');
      }).catch(err => { console.error(err); alert('Error loading order details'); });
    }

    function updateStatusTimeline(currentStatus) {
      const s = (currentStatus || 'confirmed').toLowerCase();
      const statuses = ['confirmed', 'shipped', 'delivered'];
      const labels = { confirmed: 'Confirmed', shipped: 'Shipped', delivered: 'Delivered' };
      const icons = { confirmed: 'fa-check-circle', shipped: 'fa-truck', delivered: 'fa-box-open' };
      const timeline = document.getElementById('orderStatusTimeline');
      if (!timeline) return;
      const currentIdx = statuses.indexOf(s);
      let html = statuses.map((st, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return `<div class="status-step ${done ? 'completed' : active ? 'active' : ''}">
          <div class="status-icon"><i class="fas ${done ? 'fa-check' : icons[st]}"></i></div>
          <div class="status-label">${labels[st]}</div>
        </div>`;
      }).join('');
      if (s === 'cancelled') {
        html = `<div class="status-step active"><div class="status-icon"><i class="fas fa-times"></i></div><div class="status-label">Cancelled</div></div>`;
      }
      timeline.innerHTML = html;
    }

    function updateOrderStatusFromDetails() {
      const orderId = document.getElementById('orderDetailsStatus').getAttribute('data-order-id');
      const status = document.getElementById('orderDetailsStatus').value;
      if (confirm(`Update order status to "${status}"?`)) {
        const updates = { status };
        if (status === 'delivered') updates.deliveredDate = Date.now();
        database.ref('orders/' + orderId).update(updates)
          .then(() => {
            updateStatusTimeline(status);
            loadOrders();
            if (currentAdminTab === 'dashboard') loadDashboardData();
          })
          .catch(err => alert('Error updating status: ' + err.message));
      }
    }

    function printOrderDetails() {
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <html><head><title>Order Details</title></head><body>Print functionality</body></html>
      `);
      printWindow.document.close();
      printWindow.print();
    }

    // ══════════════════════════════════════════════
    //  AUTO-TRENDING SYSTEM
    // ══════════════════════════════════════════════

    let _trendingViewFilter = 'all'; // 'all' | 'trending' | 'auto' | 'manual'
    let _allTrendingProducts = [];   // cache for filter

    function filterTrendingView(type) {
      _trendingViewFilter = type;
      // Update button styles
      ['all','trending','auto','manual'].forEach(t => {
        const btn = document.getElementById('trendFilter' + t.charAt(0).toUpperCase() + t.slice(1));
        if (btn) btn.style.cssText = t === type
          ? 'background:var(--primary);color:white;'
          : 'background:#f1f5f9;color:#334155;';
      });
      renderTrendingTable(_allTrendingProducts);
    }

    // Load trending: fetches products + orders + reviews then renders
    function loadTrendingProducts() {
      document.getElementById('trendingTableBody').innerHTML =
        '<tr><td colspan="8" style="text-align:center;padding:30px;color:#94a3b8;"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

      Promise.all([
        database.ref('products').once('value'),
        database.ref('orders').once('value'),
        database.ref('reviews').once('value')
      ]).then(([prodSnap, orderSnap, reviewSnap]) => {

        const products = prodSnap.exists()
          ? Object.entries(prodSnap.val()).map(([k, v]) => ({ id: k, ...v }))
          : [];

        // Order count per product id
        const orderCount = {};
        if (orderSnap.exists()) {
          Object.values(orderSnap.val()).forEach(o => {
            const pid = o.productId || o.id;
            if (pid) orderCount[pid] = (orderCount[pid] || 0) + 1;
          });
        }

        // Average rating per product id
        const ratingData = {};
        if (reviewSnap.exists()) {
          Object.values(reviewSnap.val()).forEach(r => {
            const pid = r.productId;
            if (!pid || !r.rating) return;
            if (!ratingData[pid]) ratingData[pid] = { total: 0, count: 0 };
            ratingData[pid].total += parseFloat(r.rating);
            ratingData[pid].count += 1;
          });
        }

        // Attach order count + avg rating to products
        const enriched = products.map(p => ({
          ...p,
          orderCount: orderCount[p.id] || 0,
          avgRating: ratingData[p.id]
            ? (ratingData[p.id].total / ratingData[p.id].count).toFixed(1)
            : (p.rating || p.ratingOverride || 0)
        }));

        _allTrendingProducts = enriched;
        renderTrendingTable(enriched);

        // Update stat cards
        const totalTrend  = enriched.filter(p => p.trending || p.autoTrending).length;
        const autoTrend   = enriched.filter(p => p.autoTrending && !p.manualTrending).length;
        const manualTrend = enriched.filter(p => p.manualTrending).length;
        const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        setEl('trendTotalCount',  totalTrend);
        setEl('trendAutoCount',   autoTrend);
        setEl('trendManualCount', manualTrend);

      }).catch(err => {
        document.getElementById('trendingTableBody').innerHTML =
          `<tr><td colspan="8" style="text-align:center;color:#ef4444;padding:20px;">Error: ${err.message}</td></tr>`;
      });
    }

    function renderTrendingTable(products) {
      const search = (document.getElementById('trendingSearch')?.value || '').toLowerCase();

      let filtered = products;
      if (search) filtered = filtered.filter(p => (p.title || '').toLowerCase().includes(search));

      if (_trendingViewFilter === 'trending') filtered = filtered.filter(p => p.trending || p.autoTrending);
      else if (_trendingViewFilter === 'auto')   filtered = filtered.filter(p => p.autoTrending && !p.manualTrending);
      else if (_trendingViewFilter === 'manual') filtered = filtered.filter(p => p.manualTrending);

      if (!filtered.length) {
        document.getElementById('trendingTableBody').innerHTML =
          '<tr><td colspan="8" style="text-align:center;padding:30px;color:#94a3b8;">No products found</td></tr>';
        return;
      }

      // Sort: trending first
      filtered.sort((a, b) => {
        const aT = (a.trending || a.autoTrending) ? 1 : 0;
        const bT = (b.trending || b.autoTrending) ? 1 : 0;
        return bT - aT;
      });

      document.getElementById('trendingTableBody').innerHTML = filtered.map(p => {
        const img = (p.images && p.images[0]) || '';
        const isTrending    = p.trending || p.autoTrending;
        const isAuto        = p.autoTrending && !p.manualTrending;
        const isManual      = p.manualTrending || (p.trending && !p.autoTrending);
        const isBoth        = p.autoTrending && p.manualTrending;
        const isLocked      = p.trendingLocked;

        // Trending type badge
        let typeBadge = '';
        if (!isTrending) {
          typeBadge = '<span style="color:#94a3b8;font-size:12px;">—</span>';
        } else if (isBoth) {
          typeBadge = '<span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">🤖+👤 Both</span>';
        } else if (isAuto) {
          const reason = p.autoTrendingReason === 'rating' ? '⭐ Top Rated' : '📦 Most Ordered';
          typeBadge = `<span style="background:#f3e8ff;color:#7c3aed;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">🤖 Auto · ${reason}</span>`;
        } else if (isManual) {
          typeBadge = '<span style="background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">👤 Manual</span>';
        }
        if (isLocked) {
          typeBadge += ' <span style="background:#fef3c7;color:#d97706;padding:1px 6px;border-radius:20px;font-size:10px;font-weight:700;">🔒 Locked</span>';
        }

        // Status badge
        const statusBadge = isTrending
          ? '<span style="background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">🔥 Trending</span>'
          : '<span style="background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">Not Trending</span>';

        // Stars display
        const rating = parseFloat(p.avgRating) || 0;
        const stars = rating > 0
          ? `<span style="color:#f59e0b;">★</span> ${rating} <span style="font-size:11px;color:#94a3b8;">(${(p.reviewCount||0)})</span>`
          : '<span style="color:#94a3b8;font-size:12px;">No reviews</span>';

        // Action buttons
        let actions = '';
        if (isTrending) {
          actions = `<button class="btn btn-danger btn-sm" onclick="removeTrendingProduct('${p.id}')" title="Remove from Trending">
            <i class="fas fa-times"></i> Remove
          </button>`;
        } else {
          actions = `<button class="btn btn-success btn-sm" onclick="addManualTrending('${p.id}')" title="Add to Trending">
            <i class="fas fa-fire"></i> Add
          </button>`;
        }
        // Lock/Unlock button
        if (isTrending) {
          actions += ` <button class="btn btn-sm" style="background:${isLocked?'#fef9c3':'#f1f5f9'};color:${isLocked?'#d97706':'#64748b'};" onclick="toggleTrendingLock('${p.id}', ${!isLocked})" title="${isLocked?'Unlock - auto system can change this':'Lock - auto system cannot remove this'}">
            <i class="fas ${isLocked?'fa-lock':'fa-lock-open'}"></i>
          </button>`;
        }

        return `<tr>
          <td><img src="${img}" class="product-image" onerror="this.src='https://via.placeholder.com/50'" style="width:44px;height:44px;border-radius:6px;object-fit:cover;"></td>
          <td style="font-weight:500;">${p.title || 'No Name'}</td>
          <td>₹${(p.price || 0).toLocaleString()}</td>
          <td><span style="font-weight:700;color:#2563eb;">${p.orderCount || 0}</span></td>
          <td>${stars}</td>
          <td>${typeBadge}</td>
          <td>${statusBadge}</td>
          <td><div style="display:flex;gap:6px;flex-wrap:wrap;">${actions}</div></td>
        </tr>`;
      }).join('');
    }

    // ── Manual Add ──────────────────────────────────────────────────
    function addManualTrending(productId) {
      database.ref('products/' + productId).update({
        trending: true,
        manualTrending: true,
        trendingLocked: true   // manual = locked by default
      }).then(() => {
        showAdminToast('✅ Product added to Trending!', 'success');
        loadTrendingProducts();
        loadDashboardData();
      }).catch(err => alert('Error: ' + err.message));
    }

    // ── Remove (works for both auto and manual) ──────────────────────
    function removeTrendingProduct(productId) {
      database.ref('products/' + productId).update({
        trending: false,
        manualTrending: false,
        autoTrending: false,
        trendingLocked: false,
        autoTrendingRemoved: true   // flag so auto won't re-add
      }).then(() => {
        showAdminToast('Product removed from Trending.', 'success');
        loadTrendingProducts();
        loadDashboardData();
      }).catch(err => alert('Error: ' + err.message));
    }

    // ── Lock / Unlock ────────────────────────────────────────────────
    function toggleTrendingLock(productId, lock) {
      database.ref('products/' + productId).update({ trendingLocked: lock })
        .then(() => {
          showAdminToast(lock ? '🔒 Product locked - auto system nahi hatayega' : '🔓 Product unlocked', 'success');
          loadTrendingProducts();
        }).catch(err => alert('Error: ' + err.message));
    }

    // Keep old toggleTrending as alias for backward compatibility
    function toggleTrending(productId, isTrending) {
      if (isTrending) addManualTrending(productId);
      else removeTrendingProduct(productId);
    }

    // ── Auto-Trending Core ───────────────────────────────────────────
    async function runAutoTrending(showToast = false) {
      const btn = document.getElementById('autoTrendingBtn');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...'; }

      try {
        // Load settings from Firebase (or defaults)
        const settSnap = await database.ref('adminSettings/autoTrending').once('value');
        const settings = settSnap.exists() ? settSnap.val() : {};
        const topOrders  = parseInt(settings.topOrders  || 5);
        const topRating  = parseInt(settings.topRating  || 5);
        const minOrders  = parseInt(settings.minOrders  || 1);
        const override   = settings.overrideLocks === true;

        // Fetch products + orders + reviews
        const [prodSnap, orderSnap, reviewSnap] = await Promise.all([
          database.ref('products').once('value'),
          database.ref('orders').once('value'),
          database.ref('reviews').once('value')
        ]);

        const products = prodSnap.exists()
          ? Object.entries(prodSnap.val()).map(([k, v]) => ({ id: k, ...v }))
          : [];

        // Count orders per productId
        const orderCount = {};
        if (orderSnap.exists()) {
          Object.values(orderSnap.val()).forEach(o => {
            const pid = o.productId || o.id;
            if (pid) orderCount[pid] = (orderCount[pid] || 0) + 1;
          });
        }

        // Average rating per productId
        const ratingData = {};
        if (reviewSnap.exists()) {
          Object.values(reviewSnap.val()).forEach(r => {
            const pid = r.productId;
            if (!pid || !r.rating) return;
            if (!ratingData[pid]) ratingData[pid] = { total: 0, count: 0 };
            ratingData[pid].total += parseFloat(r.rating);
            ratingData[pid].count += 1;
          });
        }

        // Score each product
        const scored = products
          .filter(p => p.status !== 'inactive')
          .map(p => ({
            ...p,
            orderCount: orderCount[p.id] || 0,
            avgRating:  ratingData[p.id] ? (ratingData[p.id].total / ratingData[p.id].count) : parseFloat(p.rating || p.ratingOverride || 0),
            reviewCount: ratingData[p.id] ? ratingData[p.id].count : 0
          }));

        // Top by orders (minimum order threshold)
        const topByOrders = scored
          .filter(p => p.orderCount >= minOrders)
          .sort((a, b) => b.orderCount - a.orderCount)
          .slice(0, topOrders)
          .map(p => p.id);

        // Top by rating
        const topByRating = scored
          .filter(p => p.avgRating > 0)
          .sort((a, b) => b.avgRating - a.avgRating)
          .slice(0, topRating)
          .map(p => p.id);

        const autoTrendSet = new Set([...topByOrders, ...topByRating]);

        // Build Firebase multi-path updates
        const updates = {};
        products.forEach(p => {
          const shouldAutoTrend = autoTrendSet.has(p.id);
          const isLocked = p.trendingLocked && !override;
          const wasRemoved = p.autoTrendingRemoved && !override;

          if (shouldAutoTrend && !isLocked && !wasRemoved) {
            const reason = topByOrders.includes(p.id) && topByRating.includes(p.id)
              ? 'both'
              : topByOrders.includes(p.id) ? 'orders' : 'rating';
            updates[`products/${p.id}/autoTrending`]       = true;
            updates[`products/${p.id}/trending`]           = true;
            updates[`products/${p.id}/autoTrendingReason`] = reason;
            updates[`products/${p.id}/autoTrendingAt`]     = Date.now();
            if (override) {
              updates[`products/${p.id}/autoTrendingRemoved`] = false;
            }
          } else if (!shouldAutoTrend && p.autoTrending && !p.trendingLocked) {
            // Was auto-trending but no longer qualifies → remove auto flag
            updates[`products/${p.id}/autoTrending`]       = false;
            updates[`products/${p.id}/autoTrendingReason`] = null;
            // Only set trending false if also not manually trending
            if (!p.manualTrending) {
              updates[`products/${p.id}/trending`] = false;
            }
          }
        });

        if (Object.keys(updates).length) {
          await database.ref().update(updates);
        }

        // Save last run timestamp
        await database.ref('adminSettings/autoTrending/lastRun').set(Date.now());

        const el = document.getElementById('autoTrendingLastRun');
        if (el) el.textContent = 'Last run: ' + new Date().toLocaleString('en-IN');

        if (showToast) showAdminToast(`✅ Auto-trending updated! ${autoTrendSet.size} products trending.`, 'success');
        loadTrendingProducts();
        loadDashboardData();

      } catch(err) {
        console.error('Auto-trending error:', err);
        if (showToast) showAdminToast('Error running auto-trending: ' + err.message, 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Run Auto-Update Now'; }
      }
    }

    // ── Settings Modal ───────────────────────────────────────────────
    function showAutoTrendingSettings() {
      database.ref('adminSettings/autoTrending').once('value').then(snap => {
        const s = snap.exists() ? snap.val() : {};
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        setVal('autoTrendTopOrders', s.topOrders || 5);
        setVal('autoTrendTopRating', s.topRating || 5);
        setVal('autoTrendMinOrders', s.minOrders || 1);
        const ov = document.getElementById('autoTrendOverrideLocks');
        if (ov) ov.checked = false;
        if (s.lastRun) {
          const el = document.getElementById('autoTrendingLastRun');
          if (el) el.textContent = 'Last run: ' + new Date(s.lastRun).toLocaleString('en-IN');
        }
        document.getElementById('autoTrendingSettingsModal').classList.add('active');
      });
    }

    async function saveAutoTrendingSettings() {
      const settings = {
        topOrders:      parseInt(document.getElementById('autoTrendTopOrders').value) || 5,
        topRating:      parseInt(document.getElementById('autoTrendTopRating').value) || 5,
        minOrders:      parseInt(document.getElementById('autoTrendMinOrders').value) || 1,
        overrideLocks:  document.getElementById('autoTrendOverrideLocks').checked
      };
      await database.ref('adminSettings/autoTrending').update(settings);
      closeModal('autoTrendingSettingsModal');
      showAdminToast('Settings saved! Running auto-update...', 'success');
      runAutoTrending(true);
    }

    // Load similar products
    function loadSimilarProducts() {
      const similarProductsRef = database.ref('similarProducts');
      const productsRef = database.ref('products');
      
      Promise.all([
        new Promise(resolve => similarProductsRef.once('value', snapshot => resolve(snapshot.val()))),
        new Promise(resolve => productsRef.once('value', snapshot => resolve(snapshot.val())))
      ]).then(([similarData, productsData]) => {
        let similarProducts = [];
        let products = [];
        
        if (similarData) {
          similarProducts = Object.entries(similarData).map(([key, value]) => ({
            key,
            ...value,
            mainProductId: value.mainProductId || key
          }));
        }
        
        if (productsData) {
          products = Object.entries(productsData).map(([key, value]) => ({
            ...value,
            id: value.id || key
          }));
        }
        
        const filteredSimilarProducts = filterSimilarProductsList(similarProducts, products);
        const totalPages = Math.ceil(filteredSimilarProducts.length / similarProductsPerPage);
        
        updatePagination('similarProductsPagination', currentSimilarProductsPage, totalPages, 'similar-products');
        
        const startIndex = (currentSimilarProductsPage - 1) * similarProductsPerPage;
        const paginatedSimilarProducts = filteredSimilarProducts.slice(startIndex, startIndex + similarProductsPerPage);
        
        const similarProductsHtml = paginatedSimilarProducts.map(item => {
          const mainProduct = products.find(p => p.id === item.mainProductId);
          const similarCount = item.similarProductIds ? item.similarProductIds.length : 0;
          const images = mainProduct ? (mainProduct.images || []) : [];
          const mainImage = images.length > 0 ? images[0] : '';
          
          return `
            <tr>
              <td>${mainProduct ? mainProduct.title : 'Product ID: ' + item.mainProductId}</td>
              <td>
                ${mainImage ? 
                  `<img src="${mainImage}" class="product-image" onerror="this.src='https://via.placeholder.com/50'">` : 
                  '<div class="product-image" style="background: #f1f5f9; display: flex; align-items: center; justify-content: center;"><i class="fas fa-image"></i></div>'
                }
              </td>
              <td>${similarCount}</td>
              <td>${item.status === 'active' ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-warning">Inactive</span>'}</td>
              <td>
                <div style="display: flex; gap: 8px;">
                  <button class="btn btn-primary btn-sm" onclick="editSimilarProducts('${item.mainProductId}')"><i class="fas fa-edit"></i></button>
                  <button class="btn btn-danger btn-sm" onclick="deleteSimilarProducts('${item.mainProductId}')"><i class="fas fa-trash"></i></button>
                </div>
              </td>
            </tr>
          `;
        }).join('');
        
        document.getElementById('similarProductsTableBody').innerHTML = 
          similarProductsHtml || '<tr><td colspan="5" style="text-align: center">No similar products configured</td></tr>';
      }).catch(error => {
        console.error('Error loading similar products:', error);
      });
    }

    function filterSimilarProductsList(similarProducts, products) {
      const searchTerm = document.getElementById('similarProductsSearch')?.value.toLowerCase() || '';
      return similarProducts.filter(item => {
        const mainProduct = products.find(p => p.id === item.mainProductId);
        return mainProduct && (mainProduct.title || '').toLowerCase().includes(searchTerm);
      });
    }

    function filterSimilarProducts() {
      currentSimilarProductsPage = 1;
      loadSimilarProducts();
    }

    // Load customers
    function loadCustomers() {
      Promise.all([
        database.ref('users').once('value'),
        database.ref('orders').once('value')
      ]).then(([usersSnap, ordersSnap]) => {
        const usersData = usersSnap.val() || {};
        const ordersData = ordersSnap.val() || {};

        const orderCountMap = {};
        const lastOrderMap = {};
        Object.values(ordersData).forEach(o => {
          if (!o.userId) return;
          orderCountMap[o.userId] = (orderCountMap[o.userId] || 0) + 1;
          if (!lastOrderMap[o.userId] || (o.orderDate || 0) > lastOrderMap[o.userId]) {
            lastOrderMap[o.userId] = o.orderDate || 0;
          }
        });

        const customers = Object.entries(usersData).map(([uid, u]) => ({
          uid,
          name: u.displayName || u.name || 'N/A',
          username: u.username ? '@' + u.username : '—',
          email: u.email || 'N/A',
          photo: u.photoURL || '',
          createdAt: u.createdAt || 0,
          lastLogin: u.lastLoginAt || 0,
          orderCount: orderCountMap[uid] || 0,
          lastOrder: lastOrderMap[uid] || 0
        }));

        customers.sort((a, b) => (b.lastLogin || b.createdAt) - (a.lastLogin || a.createdAt));

        const searchTerm = (document.getElementById('customerSearch')?.value || '').toLowerCase();
        const filtered = searchTerm ? customers.filter(c =>
          c.name.toLowerCase().includes(searchTerm) ||
          c.email.toLowerCase().includes(searchTerm) ||
          c.username.toLowerCase().includes(searchTerm)
        ) : customers;

        const totalPages = Math.ceil(filtered.length / customersPerPage);
        updatePagination('customersPagination', currentCustomersPage, totalPages, 'customers');
        const start = (currentCustomersPage - 1) * customersPerPage;
        const paged = filtered.slice(start, start + customersPerPage);

        const html = paged.length ? paged.map(c => `
          <tr>
            <td>
              <div style="display:flex;align-items:center;gap:8px;">
                ${c.photo ? `<img src="${c.photo}" width="32" height="32" style="border-radius:50%;object-fit:cover;" onerror="this.style.display='none'">` : '<div style="width:32px;height:32px;border-radius:50%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#64748b;">' + (c.name[0]||'?') + '</div>'}
                <div><div style="font-weight:600;">${c.name}</div><div style="font-size:11px;color:#94a3b8;">${c.uid.slice(0,8)}...</div></div>
              </div>
            </td>
            <td><span style="font-size:13px;font-weight:700;color:${c.username==='—'?'#94a3b8':'#2563eb'};font-family:monospace;">${c.username}</span></td>
            <td>${c.email}</td>
            <td><span style="background:#dbeafe;color:#1d4ed8;padding:3px 8px;border-radius:20px;font-size:12px;font-weight:600;">${c.orderCount}</span></td>
            <td>${c.lastOrder ? new Date(c.lastOrder).toLocaleDateString('en-IN') : 'Never'}</td>
            <td>${c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN') : 'N/A'}</td>
          </tr>
        `).join('') : '<tr><td colspan="5" style="text-align:center;padding:20px;color:#94a3b8;">No customers yet</td></tr>';

        document.getElementById('customersTableBody').innerHTML = html;
      }).catch(err => console.error('Error loading customers:', err));
    }

    function filterCustomers() {
      currentCustomersPage = 1;
      loadCustomers();
    }

    // Load banners
    function loadBanners() {
      const bannersRef = database.ref('banners');
      bannersRef.once('value', snapshot => {
        const bannersData = snapshot.val();
        let banners = [];
        
        if (bannersData) {
          banners = Object.entries(bannersData).map(([key, value]) => ({
            ...value,
            id: value.id || key
          }));
        }
        
        const bannersHtml = banners.map(banner => `
          <tr>
            <td>#${banner.id}</td>
            <td><img src="${banner.image || ''}" width="100" height="50" style="object-fit: cover; border-radius: 6px" onerror="this.src='https://via.placeholder.com/100x50'"></td>
            <td>${banner.title || 'No Title'}</td>
            <td>${banner.status === 'active' ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Inactive</span>'}</td>
            <td>
              <div style="display: flex; gap: 8px;">
                <button class="btn btn-primary btn-sm" onclick="editBanner('${banner.id}')"><i class="fas fa-edit"></i></button>
                <button class="btn btn-danger btn-sm" onclick="deleteBanner('${banner.id}')"><i class="fas fa-trash"></i></button>
              </div>
            </td>
          </tr>
        `).join('');
        
        document.getElementById('bannersTableBody').innerHTML = bannersHtml || '<tr><td colspan="5" style="text-align: center">No banners found</td></tr>';
      }).catch(error => {
        console.error('Error loading banners:', error);
      });
    }

    // Load policies
    function loadPolicies() {
      const policiesRef = database.ref('policies');
      policiesRef.once('value', snapshot => {
        const policies = snapshot.val() || {};
        
        document.getElementById('aboutContent').value = policies.about || '';
        document.getElementById('refundContent').value = policies.refund || '';
        document.getElementById('termsContent').value = policies.terms || '';
        document.getElementById('shippingContent').value = policies.shipping || '';
        document.getElementById('privacyContent').value = policies.privacy || '';
      }).catch(error => {
        console.error('Error loading policies:', error);
      });
    }

    function savePolicy(policyType) {
      const content = document.getElementById(`${policyType}Content`).value;
      
      database.ref('policies/' + policyType).set(content)
        .then(() => alert(`${policyType} policy saved successfully!`))
        .catch(error => {
          console.error('Error saving policy:', error);
          alert('Error saving policy');
        });
    }

    // Load settings
    function loadSettings() {
      // Load basic store settings
      const settingsRef = database.ref('settings');
      settingsRef.once('value', snapshot => {
        const settings = snapshot.val() || {};
        if (settings.storeName) document.getElementById('storeName').value = settings.storeName;
        if (settings.storeEmail) document.getElementById('storeEmail').value = settings.storeEmail;
        if (settings.storePhone) document.getElementById('storePhone').value = settings.storePhone;
        if (settings.storeAddress) document.getElementById('storeAddress').value = settings.storeAddress;
        if (settings.shippingCost) document.getElementById('shippingCost').value = settings.shippingCost;
        if (settings.currency) document.getElementById('currency').value = settings.currency;
        if (settings.maxItemsPerOrder) document.getElementById('maxItemsPerOrder').value = settings.maxItemsPerOrder;
        if (settings.freeShippingThreshold) document.getElementById('freeShippingThreshold').value = settings.freeShippingThreshold;
        if (settings.paymentGatewayCharge) document.getElementById('paymentGatewayCharge').value = settings.paymentGatewayCharge;
      }).catch(error => { console.error('Error loading settings:', error); });

      // Also load adminSettings for hero fields
      database.ref('adminSettings').once('value').then(snap => {
        if (!snap.exists()) return;
        const s = snap.val();
        const set = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
        set('heroHeading',    s.heroHeading    || '');
        set('heroSubheading', s.heroSubheading || '');
        set('highlightText',  s.highlightText  || '');
        set('heroMessages', Array.isArray(s.heroMessages) ? s.heroMessages.join('\n') : (s.heroMessages||''));
        const imgbbEl = document.getElementById('adminImgbbKey');
        const imgbbBadge = document.getElementById('imgbbStatusBadge');
        if (imgbbEl && s.imgbbKey && s.imgbbKey !== 'YOUR_IMGBB_API_KEY_HERE') {
          imgbbEl.value = s.imgbbKey; ADMIN_IMGBB_KEY = s.imgbbKey;
          if (imgbbBadge) { imgbbBadge.textContent = 'Active ✓'; imgbbBadge.style.background = '#dcfce7'; imgbbBadge.style.color = '#15803d'; }
        } else if (imgbbBadge) { imgbbBadge.textContent = 'Not Set'; }
        const baaEl = document.getElementById('brandAutoApproveHours');
        if (baaEl && s.brandAutoApproveHours) baaEl.value = s.brandAutoApproveHours;
        try { const fbEl = document.getElementById('fbProjectId'); if (fbEl && database.app && database.app.options) fbEl.textContent = database.app.options.projectId || 'connected'; } catch(e) {}
      }).catch(() => {});
    }

    function saveSettings() {
      const settings = {
        storeName: document.getElementById('storeName').value,
        storeEmail: document.getElementById('storeEmail').value,
        storePhone: document.getElementById('storePhone').value,
        storeAddress: document.getElementById('storeAddress').value,
        shippingCost: document.getElementById('shippingCost').value,
        currency: document.getElementById('currency').value,
        maxItemsPerOrder: document.getElementById('maxItemsPerOrder').value,
        freeShippingThreshold: document.getElementById('freeShippingThreshold').value,
        paymentGatewayCharge: document.getElementById('paymentGatewayCharge').value
      };
      
      const heroHeadingVal    = document.getElementById('heroHeading')?.value    || '';
      const heroSubheadingVal = document.getElementById('heroSubheading')?.value || '';
      const highlightVal      = document.getElementById('highlightText')?.value  || '';
      const heroMsgsRaw       = document.getElementById('heroMessages')?.value   || '';
      const heroMsgsArr       = heroMsgsRaw.split('\n').map(m => m.trim()).filter(Boolean);

      const p1 = database.ref('settings').set(settings);
      const p2 = database.ref('adminSettings').update({
        heroHeading:    heroHeadingVal,
        heroSubheading: heroSubheadingVal,
        highlightText:  highlightVal,
        heroMessages:   heroMsgsArr,
        deliveryCharge: parseFloat(settings.shippingCost) || 50,
        freeShippingOver: parseFloat(settings.freeShippingThreshold) || 999,
        updatedAt: Date.now()
      });

      Promise.all([p1, p2])
        .then(() => showAdminToast('✅ Settings saved successfully!', 'success'))
        .catch(error => { console.error('Error saving settings:', error); alert('Error saving settings'); });
    }

    function saveApiKeys() {
      const key = (document.getElementById('adminImgbbKey')?.value || '').trim();
      const hours = parseInt(document.getElementById('brandAutoApproveHours')?.value) || 24;
      if (!key) { showAdminToast('⚠️ ImgBB API key khali hai', 'warning'); return; }
      database.ref('adminSettings').update({ imgbbKey: key, brandAutoApproveHours: hours, updatedAt: Date.now() })
        .then(() => {
          ADMIN_IMGBB_KEY = key;
          const badge = document.getElementById('imgbbStatusBadge');
          if (badge) { badge.textContent = 'Active ✓'; badge.style.background = '#dcfce7'; badge.style.color = '#15803d'; }
          showAdminToast('✅ API Keys save ho gayi!', 'success');
        }).catch(err => showAdminToast('❌ ' + err.message, 'error'));
    }
    function toggleImgbbKeyVisibility() {
      const el = document.getElementById('adminImgbbKey');
      if (el) el.type = el.type === 'password' ? 'text' : 'password';
    }
    function adminToggle2FA(enabled) {
      const slider = document.getElementById('featureTwoFactorSlider');
      const knob = document.getElementById('featureTwoFactorKnob');
      const badge = document.getElementById('tfa2FABadge');
      database.ref('adminSettings/features/twoFactorAuth').set(enabled)
        .then(() => {
          if (slider) slider.style.background = enabled ? '#22c55e' : '#cbd5e1';
          if (knob) knob.style.transform = enabled ? 'translateX(24px)' : 'translateX(0)';
          if (badge) badge.innerHTML = enabled
            ? '<span style="background:#dcfce7;color:#15803d;font-size:0.75rem;font-weight:700;padding:2px 8px;border-radius:20px">✅ Active</span>'
            : '<span style="background:#fef9c3;color:#92400e;font-size:0.75rem;font-weight:700;padding:2px 8px;border-radius:20px">⏳ Coming Soon</span>';
        })
        .catch(() => {
          document.getElementById('featureTwoFactor').checked = !enabled;
        });
    }

    function adminLoad2FAStatus() {
      database.ref('adminSettings/features/twoFactorAuth').once('value').then(snap => {
        const enabled = snap.exists() && snap.val() === true;
        const cb = document.getElementById('featureTwoFactor');
        const slider = document.getElementById('featureTwoFactorSlider');
        const knob = document.getElementById('featureTwoFactorKnob');
        const badge = document.getElementById('tfa2FABadge');
        if (cb) cb.checked = enabled;
        if (slider) slider.style.background = enabled ? '#22c55e' : '#cbd5e1';
        if (knob) knob.style.transform = enabled ? 'translateX(24px)' : 'translateX(0)';
        if (badge) badge.innerHTML = enabled
          ? '<span style="background:#dcfce7;color:#15803d;font-size:0.75rem;font-weight:700;padding:2px 8px;border-radius:20px">✅ Active</span>'
          : '<span style="background:#fef9c3;color:#92400e;font-size:0.75rem;font-weight:700;padding:2px 8px;border-radius:20px">⏳ Coming Soon</span>';
      }).catch(() => {});
    }

    // Show modals
    function showAddProductModal() {
      document.getElementById('productName').value = '';
      document.getElementById('productPrice').value = '';
      document.getElementById('productStock').value = '';
      document.getElementById('productCategory').value = '';
      document.getElementById('productDesc').value = '';
      document.getElementById('productFullDesc').value = '';
      document.getElementById('productSizes').value = '';
      document.getElementById('productTrending').checked = false;
      document.getElementById('productStatus').checked = true;
      document.getElementById('productImagePreviews').innerHTML = '';
      const tagsEl = document.getElementById('productSearchTags');
      if (tagsEl) tagsEl.value = '';
      uploadedImages = [];
      selectedProductTagIds = new Set();
      
      // Reset chip display
      const display = document.getElementById('selectedTagsDisplay');
      if (display) display.innerHTML = '<span style="color:#94a3b8;font-size:13px;" id="tagsPlaceholder">Click to select tags...</span>';
      const dropdown = document.getElementById('productTagsDropdown');
      if (dropdown) dropdown.classList.remove('active-dropdown');

      updateCategoryDropdowns();
      loadTagsForProductForm();
      document.getElementById('addProductModal').classList.add('active');

      // Close dropdown when clicking outside
      setTimeout(() => {
        document.addEventListener('click', closeTagDropdownOnOutsideClick, { once: false });
      }, 100);
    }

    // Global set to track selected tag IDs in product form
    let selectedProductTagIds = new Set();

    function closeTagDropdownOnOutsideClick(e) {
      const container = document.getElementById('productTagsChipContainer');
      const dropdown = document.getElementById('productTagsDropdown');
      if (!container || !dropdown) return;
      if (!container.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove('active-dropdown');
      }
    }

    function loadTagsForProductForm() {
      const list = document.getElementById('tagCheckboxList');
      if (!list) return;
      list.innerHTML = '<div style="color:#94a3b8;text-align:center;padding:10px;font-size:13px;">Loading...</div>';

      database.ref('searchTags').once('value').then(snap => {
        if (!snap.exists()) {
          list.innerHTML = '<div style="color:#94a3b8;text-align:center;padding:10px;font-size:13px;">Koi tags nahi hain. Pehle Search Tags tab mein tags add karein.</div>';
          return;
        }
        const tags = Object.entries(snap.val()).map(([k, v]) => ({ id: k, ...v })).filter(t => t.active !== false);
        renderTagCheckboxes(tags);
      }).catch(() => {
        list.innerHTML = '<div style="color:#ef4444;text-align:center;padding:10px;font-size:13px;">Error loading tags</div>';
      });
    }

    function renderTagCheckboxes(tags, filter = '') {
      const list = document.getElementById('tagCheckboxList');
      if (!list) return;
      const filtered = filter ? tags.filter(t => (t.name || '').toLowerCase().includes(filter.toLowerCase())) : tags;
      if (!filtered.length) {
        list.innerHTML = '<div style="color:#94a3b8;text-align:center;padding:10px;font-size:13px;">No tags found</div>';
        return;
      }
      list.innerHTML = filtered.map(tag => `
        <label class="tag-checkbox-item" onclick="event.stopPropagation()">
          <input type="checkbox" value="${tag.id}" data-name="${tag.name || ''}"
            ${selectedProductTagIds.has(tag.id) ? 'checked' : ''}
            onchange="toggleProductTagChip(this, '${(tag.name || '').replace(/'/g, "\\'")}')">
          <span>${tag.name || 'Unnamed'}</span>
          ${tag.type ? `<span style="margin-left:auto;font-size:10px;color:#94a3b8;">${tag.type}</span>` : ''}
        </label>
      `).join('');
    }

    function filterTagsInDropdown() {
      const q = document.getElementById('tagSearchInput')?.value || '';
      database.ref('searchTags').once('value').then(snap => {
        if (!snap.exists()) return;
        const tags = Object.entries(snap.val()).map(([k, v]) => ({ id: k, ...v })).filter(t => t.active !== false);
        renderTagCheckboxes(tags, q);
      });
    }

    function toggleProductTagChip(checkbox, tagName) {
      const tagId = checkbox.value;
      if (checkbox.checked) {
        selectedProductTagIds.add(tagId);
      } else {
        selectedProductTagIds.delete(tagId);
      }
      updateSelectedTagsDisplay();
      // Update hidden input with tag names (comma separated) for saveProduct compatibility
      const names = [];
      document.querySelectorAll('#tagCheckboxList input[type="checkbox"]:checked').forEach(cb => {
        names.push(cb.dataset.name);
      });
      const hiddenInput = document.getElementById('productSearchTags');
      if (hiddenInput) hiddenInput.value = names.join(',');
    }

    function updateSelectedTagsDisplay() {
      const display = document.getElementById('selectedTagsDisplay');
      if (!display) return;
      if (selectedProductTagIds.size === 0) {
        display.innerHTML = '<span style="color:#94a3b8;font-size:13px;" id="tagsPlaceholder">Click to select tags...</span>';
        return;
      }
      // Get names from checked checkboxes
      const chips = [];
      document.querySelectorAll('#tagCheckboxList input[type="checkbox"]:checked').forEach(cb => {
        chips.push(`<span class="tag-chip-selected">${cb.dataset.name}<span class="remove-chip" onclick="removeTagChip('${cb.value}', event)">×</span></span>`);
      });
      // Also handle tags selected but not yet rendered in filtered list
      display.innerHTML = chips.length ? chips.join('') : '<span style="color:#94a3b8;font-size:13px;">Click to select tags...</span>';
    }

    function removeTagChip(tagId, e) {
      e.stopPropagation();
      selectedProductTagIds.delete(tagId);
      const cb = document.querySelector(`#tagCheckboxList input[value="${tagId}"]`);
      if (cb) cb.checked = false;
      updateSelectedTagsDisplay();
      const names = [];
      document.querySelectorAll('#tagCheckboxList input[type="checkbox"]:checked').forEach(c => names.push(c.dataset.name));
      const hiddenInput = document.getElementById('productSearchTags');
      if (hiddenInput) hiddenInput.value = names.join(',');
    }

    function showAddCategoryModal() {
      document.getElementById('categoryName').value = '';
      document.getElementById('categoryDescription').value = '';
      document.getElementById('categoryStatus').checked = true;
      document.getElementById('categoryImagePreview').innerHTML = '<span>No image selected</span>';
      uploadedCategoryImage = null;
      document.getElementById('addCategoryModal').classList.add('active');
    }

    function showAddBannerModal() {
      document.getElementById('bannerTitle').value = '';
      document.getElementById('bannerLink').value = '';
      document.getElementById('bannerStatus').checked = true;
      document.getElementById('bannerImagePreview').innerHTML = '<span>No image selected</span>';
      uploadedBannerImage = null;
      document.getElementById('addBannerModal').classList.add('active');
    }

    function showAddSimilarProductsModal() {
      const productsRef = database.ref('products');
      productsRef.once('value', snapshot => {
        const productsData = snapshot.val();
        let products = [];
        
        if (productsData) {
          products = Object.entries(productsData).map(([key, value]) => ({
            ...value,
            id: value.id || key
          }));
        }
        
        allProductsForSimilar = products;
        
        const mainProductSelect = document.getElementById('mainProductSelect');
        mainProductSelect.innerHTML = '<option value="">-- Select Product --</option>' +
          products.map(product => 
            `<option value="${product.id}">${product.title || 'No Name'} (₹${product.price || 0})</option>`
          ).join('');
        
        const similarProductsSelect = document.getElementById('similarProductsSelect');
        similarProductsSelect.innerHTML = products.map(product => 
          `<option value="${product.id}">${product.title || 'No Name'} (₹${product.price || 0}) - ${product.category || 'Uncategorized'}</option>`
        ).join('');
        
        document.getElementById('selectedProductInfo').style.display = 'none';
        document.getElementById('selectedSimilarProductsPreview').innerHTML = '';
        document.getElementById('autoSuggestSimilar').checked = true;
        
        document.getElementById('addSimilarProductsModal').classList.add('active');
      }).catch(error => {
        console.error('Error loading products for similar modal:', error);
        alert('Error loading products');
      });
    }

    function showAddSearchTagModal() {
      document.getElementById('searchTagName').value = '';
      document.getElementById('searchTagType').value = 'trending';
      document.getElementById('searchTagActive').checked = true;
      document.getElementById('addSearchTagModal').classList.add('active');
    }

    function showAddPopularSearchModal() {
      document.getElementById('popularSearchTerm').value = '';
      document.getElementById('popularSearchCount').value = '1';
      document.getElementById('popularSearchActive').checked = true;
      document.getElementById('addPopularSearchModal').classList.add('active');
    }

    // Save functions
    function saveSearchTag() {
      const name = document.getElementById('searchTagName').value.trim();
      const type = document.getElementById('searchTagType').value;
      const active = document.getElementById('searchTagActive').checked;
      if (!name) { showToast('Please enter a tag name', 'error'); return; }
      const tagId = 'tag_' + Date.now();

      // Write to main path
      database.ref('searchTags/' + tagId).set({ name, type, active: true, createdAt: Date.now() })
        .then(() => {
          // Also sync to adminSettings so real site sees it
          return database.ref('adminSettings/searchTags').once('value').then(snap => {
            let existing = [];
            if (snap.exists()) {
              const d = snap.val();
              if (Array.isArray(d)) existing = d.map(t => typeof t === 'string' ? t : (t.name || t));
              else if (typeof d === 'string') existing = d.split(',').map(s => s.trim()).filter(Boolean);
            }
            if (!existing.includes(name)) {
              existing.push(name);
              return database.ref('adminSettings/searchTags').set(existing);
            }
          });
        })
        .then(() => {
          closeModal('addSearchTagModal');
          showToast('Search tag added!', 'success');
        })
        .catch(error => showToast('Error: ' + error.message, 'error'));
    }

    function deleteSearchTag(tagId) {
      if (confirm('Delete this search tag?')) {
        database.ref('searchTags/' + tagId).remove()
          .then(() => {
            database.ref('tagProducts/' + tagId).remove();
            // Sync adminSettings
            if (tagId.startsWith('as_tag_')) {
              // From adminSettings, remove by index
              loadSearchTags();
            }
            showToast('Tag deleted', 'success');
          })
          .catch(error => showToast('Error: ' + error.message, 'error'));
      }
    }

    function bulkAddSearchTags() {
      const bulkText = document.getElementById('bulkSearchTags').value.trim();
      if (!bulkText) { showToast('Please enter tags', 'error'); return; }
      const tags = bulkText.split(',').map(t => t.trim()).filter(Boolean);
      if (!tags.length) { showToast('No valid tags', 'error'); return; }
      
      const updates = {};
      tags.forEach(tag => {
        const tagId = 'tag_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        updates[`searchTags/${tagId}`] = { name: tag, type: 'general', active: true, createdAt: Date.now() };
      });
      
      database.ref().update(updates)
        .then(() => {
          document.getElementById('bulkSearchTags').value = '';
          showToast(`${tags.length} tags added!`, 'success');
        })
        .catch(error => showToast('Error: ' + error.message, 'error'));
    }

    function savePopularSearch() {
      const term = document.getElementById('popularSearchTerm').value.trim();
      const count = parseInt(document.getElementById('popularSearchCount').value) || 1;
      if (!term) { showToast('Please enter a search term', 'error'); return; }

      // Write to main path
      database.ref('popularSearches/search_' + Date.now()).set({ term, count, active: true, createdAt: Date.now() })
        .then(() => {
          // Also sync to adminSettings so real site sees it
          return database.ref('adminSettings/popularSearches').once('value').then(snap => {
            let existing = [];
            if (snap.exists()) {
              const d = snap.val();
              if (Array.isArray(d)) existing = d.map(t => typeof t === 'string' ? t : (t.term || t.name || t));
              else if (typeof d === 'string') existing = d.split(',').map(s => s.trim()).filter(Boolean);
            }
            const existingLower = existing.map(t => t.toLowerCase());
            if (!existingLower.includes(term.toLowerCase())) {
              existing.push(term);
              return database.ref('adminSettings/popularSearches').set(existing);
            }
          });
        })
        .then(() => {
          closeModal('addPopularSearchModal');
          showToast('Popular search added!', 'success');
        })
        .catch(error => showToast('Error: ' + error.message, 'error'));
    }

    function deletePopularSearch(searchId) {
      if (confirm('Delete this popular search?')) {
        database.ref('popularSearches/' + searchId).remove()
          .then(() => showToast('Deleted!', 'success'))
          .catch(error => showToast('Error: ' + error.message, 'error'));
      }
    }

    function bulkAddPopularSearches() {
      const bulkText = document.getElementById('bulkPopularSearches').value.trim();
      if (!bulkText) { showToast('Please enter searches', 'error'); return; }
      const searches = bulkText.split(',').map(s => s.trim()).filter(Boolean);
      if (!searches.length) { showToast('No valid searches', 'error'); return; }
      
      const updates = {};
      searches.forEach(term => {
        updates[`popularSearches/search_${Date.now()}_${Math.random().toString(36).substr(2,6)}`] = { term, count: 1, active: true, createdAt: Date.now() };
      });
      database.ref().update(updates)
        .then(() => { document.getElementById('bulkPopularSearches').value = ''; showToast(`${searches.length} searches added!`, 'success'); })
        .catch(error => showToast('Error: ' + error.message, 'error'));
    }

    function generatePopularSearchesFromProducts() {
      const productsRef = database.ref('products');
      productsRef.once('value', snapshot => {
        const productsData = snapshot.val();
        let products = [];
        
        if (productsData) {
          products = Object.entries(productsData).map(([key, value]) => ({
            ...value,
            id: value.id || key
          }));
        }
        
        const searchTerms = new Set();
        
        products.slice(0, 20).forEach(product => {
          if (product.title) {
            const words = product.title.split(' ');
            words.forEach(word => {
              if (word.length > 3) searchTerms.add(word);
            });
          }
        });
        
        allCategories.forEach(category => {
          if (category.name) searchTerms.add(category.name);
        });
        
        const updates = {};
        Array.from(searchTerms).slice(0, 30).forEach(term => {
          const searchId = 'search_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
          updates[`popularSearches/${searchId}`] = {
            term: term,
            count: Math.floor(Math.random() * 50) + 10,
            active: true,
            createdAt: Date.now()
          };
        });
        
        database.ref().update(updates)
          .then(() => {
            loadPopularSearches();
            alert('Popular searches generated successfully!');
          })
          .catch(error => {
            console.error('Error generating searches:', error);
            alert('Error generating searches');
          });
      });
    }

    // Image upload functions
    async function handleProductImageUpload(e) {
      const files = Array.from(e.target.files);
      const previewContainer = document.getElementById('productImagePreviews');
      previewContainer.innerHTML = '';
      uploadedImages = [];
      if (!files.length) return;

      const usingImgBB = ADMIN_IMGBB_KEY && ADMIN_IMGBB_KEY !== 'YOUR_IMGBB_API_KEY_HERE';
      const saveBtn = document.getElementById('saveProductBtn');
      if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...'; }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const localUrl = URL.createObjectURL(file);
        const previewItem = document.createElement('div');
        previewItem.className = 'image-preview-item';
        previewItem.style.cssText = 'position:relative;display:inline-block;margin:4px;';
        const img = document.createElement('img');
        img.src = localUrl;
        img.style.cssText = 'width:80px;height:80px;object-fit:contain;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;display:block;';
        const progressBar = document.createElement('div');
        progressBar.style.cssText = 'position:absolute;bottom:0;left:0;right:0;height:3px;background:#2563eb;width:0%;border-radius:0 0 8px 8px;transition:width 0.3s;';
        previewItem.appendChild(img);
        previewItem.appendChild(progressBar);
        previewContainer.appendChild(previewItem);

        try {
          progressBar.style.width = '40%';
          const url = await uploadImageToImgBBAdmin(file);
          uploadedImages.push(url);
          progressBar.style.width = '100%';
          const badge = document.createElement('div');
          badge.style.cssText = 'position:absolute;bottom:2px;left:2px;right:2px;background:rgba(34,197,94,0.92);color:#fff;font-size:9px;border-radius:4px;padding:2px 4px;text-align:center;font-weight:700;';
          badge.textContent = usingImgBB ? '✓ ImgBB' : '✓ Done';
          previewItem.appendChild(badge);
        } catch(err) {
          console.error('Upload failed:', err.message);
          progressBar.style.background = '#ef4444';
        }
      }
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Product'; }
      if (usingImgBB) showAdminToast('✅ ' + uploadedImages.length + ' image(s) uploaded to ImgBB!', 'success');
    }

    function fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error('File read failed'));
        reader.readAsDataURL(file);
      });
    }

    function addImageFromUrl() {
      const input = document.getElementById('productImageUrlInput');
      const url = input?.value?.trim();
      if (!url || !url.startsWith('http')) { alert('Please enter a valid image URL starting with http'); return; }
      uploadedImages.push(url);
      const previewContainer = document.getElementById('productImagePreviews');
      const previewItem = document.createElement('div');
      previewItem.style.cssText = 'position:relative;display:inline-block;margin:4px;';
      previewItem.innerHTML = `<img src="${url}" style="width:80px;height:80px;object-fit:contain;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;" onerror="this.style.border='2px solid #ef4444'">
        <div style="position:absolute;bottom:2px;left:2px;right:2px;background:rgba(37,99,235,0.9);color:#fff;font-size:9px;border-radius:4px;padding:2px 4px;text-align:center;font-weight:700;">URL</div>`;
      previewContainer.appendChild(previewItem);
      if (input) input.value = '';
    }

    async function handleCategoryImageUpload(e) {
      const file = e.target.files[0];
      if (!file) return;
      const preview = document.getElementById('categoryImagePreview');
      preview.innerHTML = '<div style="color:#2563eb;padding:8px;font-size:13px;"><i class="fas fa-spinner fa-spin"></i> Uploading...</div>';
      uploadedCategoryImage = null;
      try {
        const url = await uploadImageToImgBBAdmin(file);
        uploadedCategoryImage = url;
        const isImgBB = url.startsWith('http');
        preview.innerHTML = `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <img src="${url}" style="height:60px;width:60px;object-fit:contain;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;" onerror="this.style.border='2px solid red'">
          <div><div style="color:#22c55e;font-size:12px;font-weight:700;">✓ ${isImgBB?'Uploaded to ImgBB':'Ready (Base64)'}</div></div></div>`;
      } catch(err) {
        preview.innerHTML = `<div style="color:#ef4444;font-size:12px;">✗ ${err.message}</div>`;
      }
    }

    // ── Banner live preview refresh ──
    function previewBannerSettings() {
      const lp = document.getElementById('bannerLivePreview');
      if (!lp || lp.style.display === 'none') return;
      const img = lp.querySelector('img');
      if (!img) return;
      const fit = document.getElementById('bannerObjectFit')?.value || 'cover';
      const pos = document.getElementById('bannerObjectPosition')?.value || 'center';
      const h   = document.getElementById('bannerHeightRange')?.value || 200;
      img.style.objectFit = fit;
      img.style.objectPosition = pos;
      lp.style.height = h + 'px';
    }

    // ── Categories where size is irrelevant ──
    const NO_SIZE_CATEGORIES = [
      'electronics','electric','laptop','mobile','phone','computer','tablet','tv',
      'television','camera','headphone','speaker','charger','cable','appliance',
      'digital','gadget','watch','smartwatch','earphone','earbud','keyboard',
      'mouse','monitor','printer','router','powerbank','power bank','furniture',
      'book','food','grocery','medicine','health','beauty','skincare','cosmetic',
      'decoration','decor','art','stationery','toy','baby','pet','automotive'
    ];

    function toggleSizesForCategory(val) {
      const group = document.getElementById('productSizesGroup');
      if (!group) return;
      const hide = NO_SIZE_CATEGORIES.some(k => (val||'').toLowerCase().includes(k));
      group.style.display = hide ? 'none' : '';
      if (hide) { const inp = document.getElementById('productSizes'); if (inp) inp.value = ''; }
    }

    async function handleBannerImageUpload(e) {
      const file = e.target.files[0];
      if (!file) return;
      const preview = document.getElementById('bannerImagePreview');
      preview.innerHTML = '<div style="color:#2563eb;padding:8px;font-size:13px;"><i class="fas fa-spinner fa-spin"></i> Uploading...</div>';
      uploadedBannerImage = null;
      try {
        const url = await uploadImageToImgBBAdmin(file);
        uploadedBannerImage = url;
        const isImgBB = url.startsWith('http');
        preview.innerHTML = `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <img src="${url}" style="height:60px;width:120px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0;" onerror="this.style.border='2px solid red'">
          <div><div style="color:#22c55e;font-size:12px;font-weight:700;">✓ ${isImgBB?'Uploaded to ImgBB':'Ready (Base64)'}</div></div></div>`;
        // Update live preview with current display settings
        const livePreview = document.getElementById('bannerLivePreview');
        if (livePreview) {
          const h   = document.getElementById('bannerHeightRange')?.value || 200;
          const fit = document.getElementById('bannerObjectFit')?.value || 'cover';
          const pos = document.getElementById('bannerObjectPosition')?.value || 'center';
          livePreview.style.cssText = 'display:block;height:'+h+'px;border-radius:8px;overflow:hidden;border:2px dashed #2563eb;margin-top:10px;';
          livePreview.innerHTML = '<img src="'+url+'" style="width:100%;height:100%;object-fit:'+fit+';object-position:'+pos+';display:block;">';
        }
      } catch(err) {
        preview.innerHTML = `<div style="color:#ef4444;font-size:12px;">✗ ${err.message}</div>`;
      }
    }

    // ── IMGBB CONFIG FOR ADMIN ─────────────────────────────────────
    // Get your FREE key at https://api.imgbb.com/ → Login → API
    setTimeout(function() {
      try { database.ref('adminSettings/imgbbKey').once('value').then(function(s){ if(s&&s.exists()&&s.val()){ ADMIN_IMGBB_KEY=s.val(); const b=document.getElementById('imgbbStatusBadge'); if(b){b.textContent='Active ✓';b.style.background='#dcfce7';b.style.color='#15803d';} } }).catch(function(){}); } catch(e) {}
    }, 1000);

    async function uploadImageToImgBBAdmin(file) {
      let key = window.siteConfig?.imgbbKey;
      if (!key) {
        try { const s = await database.ref('adminSettings/imgbbKey').once('value'); if(s&&s.exists()&&s.val()) key=s.val(); } catch(e) {}
      }
      if (!key) {
        key = ADMIN_IMGBB_KEY;
      }
      if (!key || key === 'YOUR_IMGBB_API_KEY_HERE') {
        // Fallback: convert to base64
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target.result);
          reader.onerror = () => resolve('');
          reader.readAsDataURL(file);
        });
      }
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64 = e.target.result.split(',')[1];
          const formData = new FormData();
          formData.append('key', key);
          formData.append('image', base64);
          try {
            const res = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: formData });
            const data = await res.json();
            resolve(data.success ? data.data.url : e.target.result);
          } catch(err) { resolve(e.target.result); }
        };
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });
    }
    // ─────────────────────────────────────────────────────────────────

    function saveProduct() {
      const name = document.getElementById('productName').value.trim();
      const price = document.getElementById('productPrice').value.trim();
      const stock = document.getElementById('productStock').value.trim();
      const category = document.getElementById('productCategory').value;
      const desc = document.getElementById('productDesc').value.trim();
      const fullDesc = document.getElementById('productFullDesc').value.trim();
      const sizesInput = document.getElementById('productSizes').value.trim();
      const trending = document.getElementById('productTrending').checked;
      const status = document.getElementById('productStatus').checked ? 'active' : 'inactive';
      
      if (!name) { alert('Please enter product name'); return; }
      if (!price || isNaN(price) || parseFloat(price) <= 0) { alert('Please enter a valid price'); return; }
      if (!category) { alert('Please select a category'); return; }
      if (!desc) { alert('Please enter product description'); return; }
      if (uploadedImages.length === 0) { alert('Please upload at least one product image'); return; }
      
      const saveBtn = document.getElementById('saveProductBtn');
      const originalText = saveBtn.innerHTML;
      saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
      saveBtn.disabled = true;
      
      const productsRef = database.ref('products');
      productsRef.once('value', snapshot => {
        const productsData = snapshot.val();
        let products = [];
        
        if (productsData) {
          products = Object.values(productsData);
        }
        
        let nextId = 1;
        if (products.length > 0) {
          const ids = products.map(p => parseInt(p.id || p.key)).filter(id => !isNaN(id));
          nextId = ids.length > 0 ? Math.max(...ids) + 1 : 1;
        }
        
        const productId = nextId.toString();
        const sizes = sizesInput ? sizesInput.split(',').map(s => s.trim()).filter(s => s) : [];
        const tagsRaw = document.getElementById('productSearchTags')?.value?.trim() || '';
        const productTags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

        const newProduct = {
          id: productId,
          title: name,
          price: parseFloat(price),
          stock: stock ? parseInt(stock) : 0,
          desc: desc,
          fullDesc: fullDesc,
          images: uploadedImages,
          sizes: sizes,
          category: category,
          trending: trending,
          status: status,
          tags: productTags,
          timestamp: Date.now()
        };
        
        productsRef.child(productId).set(newProduct)
          .then(() => {
            // Log activity for shared admin
            logSharedAdminActivity('product_add', 'Product Add kiya: ' + name, 'Category: ' + category + ' | Price: ₹' + price, productId);
            closeModal('addProductModal');
            loadProducts();
            loadTrendingProducts();
            if (currentAdminTab === 'dashboard') loadDashboardData();
            alert('Product added successfully!');
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
          })
          .catch(error => {
            console.error('Error saving product:', error);
            alert('Error saving product: ' + error.message);
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
          });
      });
    }

    function saveCategory() {
      const name = document.getElementById('categoryName').value.trim();
      const description = document.getElementById('categoryDescription').value.trim();
      const status = document.getElementById('categoryStatus').checked ? 'active' : 'inactive';
      
      if (!name) { alert('Please enter category name'); return; }
      if (!uploadedCategoryImage) { alert('Please upload a category image'); return; }
      
      const categoriesRef = database.ref('categories');
      categoriesRef.once('value', snapshot => {
        const categoriesData = snapshot.val();
        let categories = [];
        
        if (categoriesData) {
          categories = Object.values(categoriesData);
        }
        
        let nextId = 1;
        if (categories.length > 0) {
          const ids = categories.map(c => parseInt(c.id || c.key)).filter(id => !isNaN(id));
          nextId = ids.length > 0 ? Math.max(...ids) + 1 : 1;
        }
        
        const categoryId = nextId.toString();
        
        const newCategory = {
          id: categoryId,
          name: name,
          description: description,
          image: uploadedCategoryImage,
          imageFit: document.getElementById('categoryImageFit')?.value || 'cover',
          status: status,
          productCount: 0
        };
        
        categoriesRef.child(categoryId).set(newCategory)
          .then(() => {
            logSharedAdminActivity('category_add', 'Category Add ki: ' + name, 'Status: ' + status);
            allCategories.push(newCategory);
            updateCategoryDropdowns();
            closeModal('addCategoryModal');
            loadCategories();
            alert('Category added successfully!');
          })
          .catch(error => {
            console.error('Error saving category:', error);
            alert('Error saving category: ' + error.message);
          });
      });
    }

    function saveBanner() {
      const title = document.getElementById('bannerTitle').value.trim();
      const link = document.getElementById('bannerLink').value.trim();
      const status = document.getElementById('bannerStatus').checked ? 'active' : 'inactive';
      
      if (!title) { alert('Please enter banner title'); return; }
      if (!uploadedBannerImage) { alert('Please upload a banner image'); return; }
      
      const bannersRef = database.ref('banners');
      bannersRef.once('value', snapshot => {
        const bannersData = snapshot.val();
        let banners = [];
        
        if (bannersData) {
          banners = Object.values(bannersData);
        }
        
        let nextId = 1;
        if (banners.length > 0) {
          const ids = banners.map(b => parseInt(b.id || b.key)).filter(id => !isNaN(id));
          nextId = ids.length > 0 ? Math.max(...ids) + 1 : 1;
        }
        
        const bannerId = nextId.toString();
        
        const newBanner = {
          id: bannerId,
          title: title,
          link: link,
          image: uploadedBannerImage,
          status: status,
          objectFit: document.getElementById('bannerObjectFit')?.value || 'cover',
          objectPosition: document.getElementById('bannerObjectPosition')?.value || 'center',
          height: parseInt(document.getElementById('bannerHeightRange')?.value) || 200
        };
        
        bannersRef.child(bannerId).set(newBanner)
          .then(() => {
            logSharedAdminActivity('banner_add', 'Banner Add kiya', 'Banner ID: ' + bannerId);
            closeModal('addBannerModal');
            loadBanners();
            alert('Banner added successfully!');
          })
          .catch(error => {
            console.error('Error saving banner:', error);
            alert('Error saving banner: ' + error.message);
          });
      });
    }

    function loadProductDetails(productId) {
      const product = allProductsForSimilar.find(p => p.id === productId);
      if (!product) return;
      
      const infoDiv = document.getElementById('selectedProductInfo');
      const productImage = document.getElementById('selectedProductImage');
      const productName = document.getElementById('selectedProductName');
      const productDetails = document.getElementById('selectedProductDetails');
      
      const images = product.images || [];
      const mainImage = images.length > 0 ? images[0] : '';
      
      productImage.src = mainImage;
      productName.textContent = product.title || 'No Name';
      productDetails.textContent = `${product.category || 'Uncategorized'} | ₹${product.price || 0} | Stock: ${product.stock || 0}`;
      
      infoDiv.style.display = 'block';
      
      const autoSuggest = document.getElementById('autoSuggestSimilar').checked;
      if (autoSuggest) {
        const similarProductsSelect = document.getElementById('similarProductsSelect');
        const similarProducts = allProductsForSimilar.filter(p => 
          p.id !== productId && p.category === product.category
        );
        
        Array.from(similarProductsSelect.options).forEach(option => {
          option.selected = similarProducts.some(p => p.id === option.value);
        });
      }
    }

    function searchProductsForSimilar() {
      const searchTerm = document.getElementById('searchSimilarProducts').value.toLowerCase();
      const selectElement = document.getElementById('similarProductsSelect');
      
      Array.from(selectElement.options).forEach(option => {
        const text = option.text.toLowerCase();
        option.style.display = text.includes(searchTerm) ? '' : 'none';
      });
    }

    function saveSimilarProducts() {
      const mainProductId = document.getElementById('mainProductSelect').value;
      const similarProductsSelect = document.getElementById('similarProductsSelect');
      const selectedOptions = Array.from(similarProductsSelect.selectedOptions);

      if (!mainProductId) { alert('Please select a main product'); return; }
      if (selectedOptions.length === 0) { alert('Please select at least one similar product'); return; }

      const similarProductIds = selectedOptions.map(o => o.value);
      if (similarProductIds.includes(mainProductId)) { alert('Main product cannot be in similar products list'); return; }

      const updates = {};
      updates['products/' + mainProductId + '/similarFromAdmin'] = similarProductIds;
      updates['similarProducts/' + mainProductId] = {
        mainProductId,
        similarProductIds,
        status: 'active',
        updatedAt: Date.now()
      };

      database.ref().update(updates)
        .then(() => {
          closeModal('addSimilarProductsModal');
          loadSimilarProducts();
          alert('Similar products saved successfully!');
        })
        .catch(err => alert('Error: ' + err.message));
    }

    function editProduct(productId) {
      database.ref('products/' + productId).once('value', snapshot => {
        const product = snapshot.val();
        if (!product) { alert('Product not found'); return; }
        
        updateCategoryDropdowns();
        
        document.getElementById('editProductId').value = productId;
        document.getElementById('editProductName').value = product.title || '';
        document.getElementById('editProductPrice').value = product.price || 0;
        document.getElementById('editProductStock').value = product.stock || 0;
        document.getElementById('editProductCategory').value = product.category || '';
        document.getElementById('editProductDesc').value = product.desc || '';
        document.getElementById('editProductFullDesc').value = product.fullDesc || '';
        document.getElementById('editProductSizes').value = product.sizes ? product.sizes.join(', ') : '';
        document.getElementById('editProductTrending').checked = product.trending || false;
        document.getElementById('editProductStatus').checked = product.status === 'active';
        
        document.getElementById('editProductModal').classList.add('active');
      }).catch(error => {
        console.error('Error loading product for edit:', error);
        alert('Error loading product: ' + error.message);
      });
    }

    function updateProduct() {
      const productId = document.getElementById('editProductId').value;
      const name = document.getElementById('editProductName').value.trim();
      const price = document.getElementById('editProductPrice').value.trim();
      const stock = document.getElementById('editProductStock').value.trim();
      const category = document.getElementById('editProductCategory').value;
      const desc = document.getElementById('editProductDesc').value.trim();
      const fullDesc = document.getElementById('editProductFullDesc').value.trim();
      const sizesInput = document.getElementById('editProductSizes').value.trim();
      const trending = document.getElementById('editProductTrending').checked;
      const status = document.getElementById('editProductStatus').checked ? 'active' : 'inactive';
      
      if (!name || !price || !category || !desc) {
        alert('Please fill in all required fields');
        return;
      }
      
      const sizes = sizesInput ? sizesInput.split(',').map(s => s.trim()).filter(s => s) : [];
      
      const updates = {
        title: name,
        price: parseFloat(price),
        stock: stock ? parseInt(stock) : 0,
        desc: desc,
        fullDesc: fullDesc,
        sizes: sizes,
        category: category,
        trending: trending,
        status: status,
        updatedAt: Date.now()
      };
      
      database.ref('products/' + productId).update(updates)
        .then(() => {
          logSharedAdminActivity('product_edit', 'Product Edit kiya: ' + (updates.title||updates.name||productId), 'ID: ' + productId, productId);
          closeModal('editProductModal');
          loadProducts();
          loadTrendingProducts();
          if (currentAdminTab === 'dashboard') loadDashboardData();
          alert('Product updated successfully!');
        })
        .catch(error => {
          console.error('Error updating product:', error);
          alert('Error updating product: ' + error.message);
        });
    }

    function deleteProductConfirm() {
      const productId = document.getElementById('editProductId').value;
      if (confirm('Are you sure you want to delete this product?')) {
        database.ref('products/' + productId).remove()
          .then(() => {
            logSharedAdminActivity('product_delete', 'Product Delete kiya', 'ID: ' + productId, productId);
            closeModal('editProductModal');
            loadProducts();
            loadTrendingProducts();
            if (currentAdminTab === 'dashboard') loadDashboardData();
            alert('Product deleted!');
          })
          .catch(error => alert('Error: ' + error.message));
      }
    }

    function deleteProduct(productId) {
      if (confirm('Are you sure you want to delete this product?')) {
        database.ref('products/' + productId).remove()
          .then(() => {
            logSharedAdminActivity('product_delete', 'Product Delete kiya', 'Product ID: ' + productId, productId);
            loadProducts();
            loadTrendingProducts();
            if (currentAdminTab === 'dashboard') loadDashboardData();
            alert('Product deleted!');
          })
          .catch(error => alert('Error: ' + error.message));
      }
    }

    function editCategory(categoryId) {
      const cat = allCategories.find(c => c.id === categoryId || c.id === String(categoryId));
      if (!cat) { alert('Category data nahi mili. Dobara try karein.'); return; }
      document.getElementById('editCategoryId').value = cat.id;
      document.getElementById('editCategoryName').value = cat.name || '';
      document.getElementById('editCategoryDescription').value = cat.description || '';
      document.getElementById('editCategoryStatus').checked = cat.status === 'active';
      const fitEl = document.getElementById('editCategoryImageFit');
      if (fitEl) fitEl.value = cat.imageFit || 'cover';
      // Show current image
      const currentImg = document.getElementById('editCategoryCurrentImage');
      if (currentImg) {
        currentImg.innerHTML = cat.image
          ? `<img src="${cat.image}" style="height:60px;border-radius:8px;border:1px solid #e2e8f0;" onerror="this.style.display='none'">`
          : '<span style="color:#94a3b8;font-size:13px;">No image</span>';
      }
      document.getElementById('editCategoryImagePreview').innerHTML = '';
      window._editCategoryNewImage = null;
      document.getElementById('editCategoryModal').classList.add('active');
    }

    function handleEditCategoryImageUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      const preview = document.getElementById('editCategoryImagePreview');
      preview.innerHTML = '<span style="color:#64748b;font-size:13px;">Uploading...</span>';
      const imgbbKey = window.siteConfig?.imgbbKey || ((typeof ADMIN_IMGBB_KEY !== 'undefined' && ADMIN_IMGBB_KEY && ADMIN_IMGBB_KEY !== 'YOUR_IMGBB_API_KEY_HERE') ? ADMIN_IMGBB_KEY : '');
      if (!imgbbKey) {
        // Fallback: read as base64 if no ImgBB key
        const reader = new FileReader();
        reader.onload = e => {
          window._editCategoryNewImage = e.target.result;
          preview.innerHTML = `<img src="${e.target.result}" style="height:60px;border-radius:8px;" >`;
        };
        reader.readAsDataURL(file);
        return;
      }
      const formData = new FormData();
      formData.append('image', file);
      fetch(`https://api.imgbb.com/1/upload?key=${imgbbKey}`, { method: 'POST', body: formData })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            window._editCategoryNewImage = data.data.url;
            preview.innerHTML = `<img src="${data.data.url}" style="height:60px;border-radius:8px;">`;
          } else {
            preview.innerHTML = '<span style="color:#ef4444;font-size:13px;">Upload failed</span>';
          }
        })
        .catch(() => { preview.innerHTML = '<span style="color:#ef4444;font-size:13px;">Upload error</span>'; });
    }

    function updateCategory() {
      const id = document.getElementById('editCategoryId').value;
      const name = document.getElementById('editCategoryName').value.trim();
      const description = document.getElementById('editCategoryDescription').value.trim();
      const status = document.getElementById('editCategoryStatus').checked ? 'active' : 'inactive';
      const imageFit = document.getElementById('editCategoryImageFit')?.value || 'cover';
      if (!name) { alert('Category name required'); return; }
      const cat = allCategories.find(c => c.id === id || c.id === String(id));
      const currentImage = cat ? cat.image : '';
      const newImage = window._editCategoryNewImage || currentImage;
      const updates = { name, description, status, imageFit, image: newImage };
      database.ref('categories/' + id).update(updates)
        .then(() => {
          // Update allCategories in memory
          const idx = allCategories.findIndex(c => c.id === id || c.id === String(id));
          if (idx !== -1) allCategories[idx] = { ...allCategories[idx], ...updates };
          updateCategoryDropdowns();
          closeModal('editCategoryModal');
          loadCategories();
          if (typeof showAdminToast === 'function') showAdminToast('Category updated!', 'success');
          else alert('Category updated successfully!');
        })
        .catch(err => alert('Error: ' + err.message));
    }

    function editBanner(bannerId) {
      database.ref('banners/' + bannerId).once('value').then(snap => {
        if (!snap.exists()) { alert('Banner data nahi mili.'); return; }
        const banner = snap.val();
        document.getElementById('editBannerId').value = bannerId;
        document.getElementById('editBannerTitle').value = banner.title || '';
        document.getElementById('editBannerLink').value = banner.link || '';
        document.getElementById('editBannerStatus').checked = banner.status === 'active';
        const fitEl = document.getElementById('editBannerObjectFit');
        if (fitEl) fitEl.value = banner.objectFit || 'cover';
        const posEl = document.getElementById('editBannerObjectPosition');
        if (posEl) posEl.value = banner.objectPosition || 'center';
        const heightRange = document.getElementById('editBannerHeightRange');
        const heightVal = document.getElementById('editBannerHeightVal');
        if (heightRange) heightRange.value = banner.height || 200;
        if (heightVal) heightVal.textContent = (banner.height || 200) + 'px';
        // Show current image
        const currentImg = document.getElementById('editBannerCurrentImage');
        if (currentImg) {
          currentImg.innerHTML = banner.image
            ? `<img src="${banner.image}" style="height:50px;border-radius:6px;border:1px solid #e2e8f0;object-fit:cover;" onerror="this.style.display='none'">`
            : '<span style="color:#94a3b8;font-size:13px;">No image</span>';
        }
        document.getElementById('editBannerImagePreview').innerHTML = '';
        document.getElementById('editBannerLivePreview').style.display = 'none';
        window._editBannerNewImage = null;
        window._editBannerCurrentImage = banner.image || '';
        document.getElementById('editBannerModal').classList.add('active');
      }).catch(err => alert('Error loading banner: ' + err.message));
    }

    function handleEditBannerImageUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      const preview = document.getElementById('editBannerImagePreview');
      preview.innerHTML = '<span style="color:#64748b;font-size:13px;">Uploading...</span>';
      const imgbbKey = window.siteConfig?.imgbbKey || ((typeof ADMIN_IMGBB_KEY !== 'undefined' && ADMIN_IMGBB_KEY && ADMIN_IMGBB_KEY !== 'YOUR_IMGBB_API_KEY_HERE') ? ADMIN_IMGBB_KEY : '');
      if (!imgbbKey) {
        const reader = new FileReader();
        reader.onload = e => {
          window._editBannerNewImage = e.target.result;
          preview.innerHTML = `<img src="${e.target.result}" style="height:50px;border-radius:6px;object-fit:cover;">`;
          previewEditBannerSettings();
        };
        reader.readAsDataURL(file);
        return;
      }
      const formData = new FormData();
      formData.append('image', file);
      fetch(`https://api.imgbb.com/1/upload?key=${imgbbKey}`, { method: 'POST', body: formData })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            window._editBannerNewImage = data.data.url;
            preview.innerHTML = `<img src="${data.data.url}" style="height:50px;border-radius:6px;object-fit:cover;">`;
            previewEditBannerSettings();
          } else {
            preview.innerHTML = '<span style="color:#ef4444;font-size:13px;">Upload failed</span>';
          }
        })
        .catch(() => { preview.innerHTML = '<span style="color:#ef4444;font-size:13px;">Upload error</span>'; });
    }

    function previewEditBannerSettings() {
      const img = window._editBannerNewImage || window._editBannerCurrentImage || '';
      if (!img) return;
      const fit = document.getElementById('editBannerObjectFit')?.value || 'cover';
      const pos = document.getElementById('editBannerObjectPosition')?.value || 'center';
      const h = document.getElementById('editBannerHeightRange')?.value || 200;
      const preview = document.getElementById('editBannerLivePreview');
      if (preview) {
        preview.style.display = 'block';
        preview.innerHTML = `<img src="${img}" style="width:100%;height:${h}px;object-fit:${fit};object-position:${pos};display:block;">`;
      }
    }

    function updateBanner() {
      const id = document.getElementById('editBannerId').value;
      const title = document.getElementById('editBannerTitle').value.trim();
      const link = document.getElementById('editBannerLink').value.trim();
      const status = document.getElementById('editBannerStatus').checked ? 'active' : 'inactive';
      const objectFit = document.getElementById('editBannerObjectFit')?.value || 'cover';
      const objectPosition = document.getElementById('editBannerObjectPosition')?.value || 'center';
      const height = parseInt(document.getElementById('editBannerHeightRange')?.value) || 200;
      if (!title) { alert('Banner title required'); return; }
      const newImage = window._editBannerNewImage || window._editBannerCurrentImage || '';
      const updates = { title, link, status, objectFit, objectPosition, height, image: newImage };
      database.ref('banners/' + id).update(updates)
        .then(() => {
          closeModal('editBannerModal');
          loadBanners();
          if (typeof showAdminToast === 'function') showAdminToast('Banner updated!', 'success');
          else alert('Banner updated successfully!');
        })
        .catch(err => alert('Error: ' + err.message));
    }

    // Save Product and then open Similar Products modal for same product
    function saveProductAndAddSimilar() {
      const name = document.getElementById('productName').value.trim();
      const price = document.getElementById('productPrice').value.trim();
      const stock = document.getElementById('productStock').value.trim();
      const category = document.getElementById('productCategory').value;
      const desc = document.getElementById('productDesc').value.trim();
      const fullDesc = document.getElementById('productFullDesc').value.trim();
      const sizesInput = document.getElementById('productSizes').value.trim();
      const trending = document.getElementById('productTrending').checked;
      const status = document.getElementById('productStatus').checked ? 'active' : 'inactive';
      if (!name) { alert('Please enter product name'); return; }
      if (!price || isNaN(price) || parseFloat(price) <= 0) { alert('Please enter a valid price'); return; }
      if (!category) { alert('Please select a category'); return; }
      if (!desc) { alert('Please enter product description'); return; }
      if (uploadedImages.length === 0) { alert('Please upload at least one product image'); return; }
      const saveBtn = document.getElementById('saveProductSimilarBtn');
      const originalText = saveBtn.innerHTML;
      saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
      saveBtn.disabled = true;
      const productsRef = database.ref('products');
      productsRef.once('value', snapshot => {
        const productsData = snapshot.val();
        let products = productsData ? Object.values(productsData) : [];
        let nextId = 1;
        if (products.length > 0) {
          const ids = products.map(p => parseInt(p.id || p.key)).filter(id => !isNaN(id));
          nextId = ids.length > 0 ? Math.max(...ids) + 1 : 1;
        }
        const productId = nextId.toString();
        const sizes = sizesInput ? sizesInput.split(',').map(s => s.trim()).filter(s => s) : [];
        const tagsRaw = document.getElementById('productSearchTags')?.value?.trim() || '';
        const productTags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
        const newProduct = {
          id: productId, title: name, price: parseFloat(price),
          stock: stock ? parseInt(stock) : 0, desc, fullDesc,
          images: uploadedImages, sizes, category, trending, status,
          tags: productTags, timestamp: Date.now()
        };
        productsRef.child(productId).set(newProduct)
          .then(() => {
            logSharedAdminActivity('product_add', 'Product Add kiya: ' + name, 'Category: ' + category + ' | Price: ₹' + price, productId);
            closeModal('addProductModal');
            loadProducts();
            loadTrendingProducts();
            if (currentAdminTab === 'dashboard') loadDashboardData();
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
            // Now open Similar Products modal and pre-select the new product
            setTimeout(() => {
              const modal = document.getElementById('addSimilarProductsModal');
              if (!modal) return;
              // Reload allProductsForSimilar then open
              database.ref('products').once('value').then(snap => {
                allProductsForSimilar = snap.exists()
                  ? Object.entries(snap.val()).map(([k, v]) => ({ ...v, id: k }))
                  : [];
                const mainSel = document.getElementById('mainProductSelect');
                if (mainSel) {
                  mainSel.innerHTML = '<option value="">-- Select Product --</option>' +
                    allProductsForSimilar.map(p => `<option value="${p.id}" ${p.id === productId ? 'selected' : ''}>${p.title || 'Product ' + p.id}</option>`).join('');
                  mainSel.value = productId;
                  loadProductDetails(productId);
                }
                const simSel = document.getElementById('similarProductsSelect');
                if (simSel) {
                  simSel.innerHTML = allProductsForSimilar
                    .filter(p => p.id !== productId)
                    .map(p => `<option value="${p.id}">${p.title || 'Product ' + p.id} (${p.category || ''})</option>`).join('');
                }
                modal.classList.add('active');
              });
            }, 300);
          })
          .catch(error => {
            alert('Error saving product: ' + error.message);
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
          });
      });
    }

    function deleteCategory(categoryId) {
      if (confirm('Delete this category?')) {
        database.ref('categories/' + categoryId).remove()
          .then(() => {
            allCategories = allCategories.filter(c => c.id !== categoryId);
            updateCategoryDropdowns();
            loadCategories();
            alert('Category deleted.');
          })
          .catch(err => alert('Error: ' + err.message));
      }
    }

    function deleteBanner(bannerId) {
      if (confirm('Delete this banner?')) {
        database.ref('banners/' + bannerId).remove()
          .then(() => {
            loadBanners();
            alert('Banner deleted!');
          })
          .catch(error => alert('Error: ' + error.message));
      }
    }

    function editSimilarProducts(mainProductId) {
      alert('Edit similar products coming soon!');
    }

    function deleteSimilarProducts(mainProductId) {
      if (confirm('Delete similar product links?')) {
        database.ref('similarProducts/' + mainProductId).remove()
          .then(() => {
            loadSimilarProducts();
            alert('Deleted!');
          })
          .catch(error => alert('Error: ' + error.message));
      }
    }

    function exportOrders() {
      alert('Export orders functionality');
    }

    function exportCustomers() {
      alert('Export customers functionality');
    }

    function updatePagination(elementId, currentPage, totalPages, type) {
      const pagination = document.getElementById(elementId);
      if (!pagination) return;
      
      if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
      }
      
      let html = '';
      
      if (currentPage > 1) {
        html += `<div class="page-item" onclick="changePage('${type}', ${currentPage - 1})">&laquo;</div>`;
      }
      
      const startPage = Math.max(1, currentPage - 2);
      const endPage = Math.min(totalPages, startPage + 4);
      
      for (let i = startPage; i <= endPage; i++) {
        html += `<div class="page-item ${i === currentPage ? 'active' : ''}" onclick="changePage('${type}', ${i})">${i}</div>`;
      }
      
      if (currentPage < totalPages) {
        html += `<div class="page-item" onclick="changePage('${type}', ${currentPage + 1})">&raquo;</div>`;
      }
      
      pagination.innerHTML = html;
    }

    function changePage(type, page) {
      if (type === 'products') {
        currentProductsPage = page;
        loadProducts();
      } else if (type === 'orders') {
        currentOrdersPage = page;
        loadOrders();
      } else if (type === 'customers') {
        currentCustomersPage = page;
        loadCustomers();
      } else if (type === 'similar-products') {
        currentSimilarProductsPage = page;
        loadSimilarProducts();
      }
      
      window.scrollTo(0, 0);
    }

    // Offers
    function loadOffers() {
      database.ref('offers').on('value', snap => {
        const grid = document.getElementById('offersList');
        if (!grid) return;
        if (!snap.exists()) { grid.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:20px;">No offers yet.</p>'; return; }
        const offers = Object.entries(snap.val()).map(([k,v]) => ({id:k,...v}));
        grid.innerHTML = offers.map(o => `
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
            <div style="flex:1;">
              <div style="font-weight:700;font-size:15px;margin-bottom:4px;">${o.title||''}</div>
              <div style="font-size:13px;color:#64748b;margin-bottom:6px;">${o.description||o.message||''}</div>
              ${o.code ? `<span style="background:#dbeafe;color:#1d4ed8;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;">${o.code}</span>` : ''}
            </div>
            <button class="btn btn-danger btn-sm" onclick="deleteOffer('${o.id}')"><i class="fas fa-trash"></i></button>
          </div>
        `).join('');
      });
    }

    function showAddOfferModal() { /* legacy - replaced by inline form */ }

    function addNewOffer() {
      const title = document.getElementById('newOfferTitle').value.trim();
      const desc = document.getElementById('newOfferDesc').value.trim();
      const code = document.getElementById('newOfferCode').value.trim();
      const discount = document.getElementById('newOfferDiscount').value.trim();
      const dtype = document.getElementById('newOfferDiscountType').value;
      const expiry = document.getElementById('newOfferExpiry').value;
      if (!title) { showAdminToast('Please enter an offer title', 'error'); return; }
      const btn = document.getElementById('addOfferBtn');
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publishing...';
      btn.disabled = true;
      const offerId = 'offer_' + Date.now();
      const data = { title, description: desc, code, discount: discount ? (discount + dtype) : '', expiry: expiry || '', createdAt: Date.now(), status: 'active' };
      database.ref('offers/' + offerId).set(data)
        .then(() => {
          showAdminToast('✅ Offer published successfully!', 'success');
          document.getElementById('newOfferTitle').value = '';
          document.getElementById('newOfferDesc').value = '';
          document.getElementById('newOfferCode').value = '';
          document.getElementById('newOfferDiscount').value = '';
          document.getElementById('newOfferExpiry').value = '';
          btn.innerHTML = '<i class="fas fa-paper-plane"></i> Publish Offer';
          btn.disabled = false;
          loadOffers();
        })
        .catch(e => {
          showAdminToast('Error: ' + e.message, 'error');
          btn.innerHTML = '<i class="fas fa-paper-plane"></i> Publish Offer';
          btn.disabled = false;
        });
    }

    function deleteOffer(id) {
      if (!confirm('Delete this offer?')) return;
      database.ref('offers/' + id).remove()
        .then(() => { showAdminToast('Offer deleted!', 'success'); loadOffers(); })
        .catch(e => showAdminToast('Error: ' + e.message, 'error'));
    }

    function loadOffers() {
      const list = document.getElementById('offersList');
      if (!list) return;
      list.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px;"><i class="fas fa-spinner fa-spin"></i></p>';
      database.ref('offers').orderByChild('createdAt').once('value').then(snap => {
        const data = snap.val() || {};
        const entries = Object.entries(data).reverse();
        if (!entries.length) {
          list.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px;">No offers yet. Create your first offer!</p>';
          return;
        }
        list.innerHTML = entries.map(([id, o]) => {
          const expiry = o.expiry ? new Date(o.expiry).toLocaleDateString('en-IN') : null;
          const expired = o.expiry && new Date(o.expiry) < new Date();
          return `<div style="background:${expired ? '#fff7f7' : 'white'};border:1.5px solid ${expired ? '#fca5a5' : '#e2e8f0'};border-radius:14px;padding:16px;position:relative;overflow:hidden;">
            <div style="position:absolute;top:0;left:0;width:4px;height:100%;background:${expired ? '#ef4444' : 'linear-gradient(#f59e0b,#ef4444)'};"></div>
            <div style="padding-left:8px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
                <div style="flex:1;">
                  <div style="font-weight:800;font-size:14px;color:#0f172a;margin-bottom:4px;">${o.title}</div>
                  ${o.description ? `<div style="font-size:12px;color:#64748b;margin-bottom:6px;">${o.description}</div>` : ''}
                  <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                    ${o.code ? `<span style="background:#fef3c7;color:#d97706;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;font-family:monospace;">${o.code}</span>` : ''}
                    ${o.discount ? `<span style="background:#dbeafe;color:#1d4ed8;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;">${o.discount} OFF</span>` : ''}
                    ${expiry ? `<span style="background:${expired ? '#fee2e2' : '#f0fdf4'};color:${expired ? '#dc2626' : '#16a34a'};padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;">${expired ? '⚠️ Expired' : '✓'} ${expiry}</span>` : ''}
                  </div>
                </div>
                <button onclick="deleteOffer('${id}')" style="background:#fee2e2;color:#dc2626;border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;font-weight:700;flex-shrink:0;"><i class="fas fa-trash"></i></button>
              </div>
            </div>
          </div>`;
        }).join('');
      }).catch(() => {
        list.innerHTML = '<p style="text-align:center;color:#ef4444;padding:20px;">Error loading offers</p>';
      });
    }

    // ── ADMIN BRAND MANAGEMENT ────────────────────────────
    function showAddAdminBrandModal() {
      document.getElementById('adminBrandName').value = '';
      document.getElementById('adminBrandLogo').value = '';
      document.getElementById('adminBrandCategory').value = '';
      document.getElementById('adminBrandBlueTick').checked = true;
      document.getElementById('addAdminBrandModal').classList.add('active');
    }

    function saveAdminBrand() {
      const name = document.getElementById('adminBrandName').value.trim();
      if (!name) { showAdminToast('Brand name is required', 'error'); return; }
      const logo = document.getElementById('adminBrandLogo').value.trim();
      const category = document.getElementById('adminBrandCategory').value.trim();
      const blueTick = document.getElementById('adminBrandBlueTick').checked;
      const brandId = 'brand_admin_' + Date.now();
      const data = {
        name, logo: logo || '', category: category || '',
        blueTickAdmin: blueTick, isAdminBrand: true,
        status: 'active', createdAt: Date.now(),
        createdBy: 'buyzocartshop@gmail.com'
      };
      database.ref('brands/' + brandId).set(data)
        .then(() => {
          closeModal('addAdminBrandModal');
          showAdminToast('✅ Brand added' + (blueTick ? ' with Blue Tick ✓' : '') + '!', 'success');
          loadBrandsPanel();
        })
        .catch(e => showAdminToast('Error: ' + e.message, 'error'));
    }

    function suspendBrand(brandId) {
      if (!confirm('Suspend this brand? Their products will remain but they will not be listed.')) return;
      database.ref('brands/' + brandId).update({ status: 'suspended' })
        .then(() => { showAdminToast('Brand suspended!', 'success'); loadBrandsPanel(); })
        .catch(e => showAdminToast('Error: ' + e.message, 'error'));
    }

    function activateBrand(brandId) {
      database.ref('brands/' + brandId).update({ status: 'active' })
        .then(() => { showAdminToast('Brand activated!', 'success'); loadBrandsPanel(); })
        .catch(e => showAdminToast('Error: ' + e.message, 'error'));
    }

    function deleteBrand(brandId, isAdminBrand) {
      const msg = isAdminBrand
        ? 'Delete this admin brand permanently?'
        : 'Delete this brand? Their brand page will be removed.';
      if (!confirm(msg)) return;
      database.ref('brands/' + brandId).remove()
        .then(() => { showAdminToast('Brand deleted!', 'success'); loadBrandsPanel(); })
        .catch(e => showAdminToast('Error: ' + e.message, 'error'));
    }

    function toggleBlueTick(brandId, current) {
      const newVal = !current;
      database.ref('brands/' + brandId).update({ blueTickAdmin: newVal })
        .then(() => { showAdminToast(newVal ? '✅ Blue Tick added!' : 'Blue Tick removed', 'success'); loadBrandsPanel(); })
        .catch(e => showAdminToast('Error: ' + e.message, 'error'));
    }

    // ── NOTIFICATIONS (Enhanced Real-Time) ──────────────────────────────
    function sendAdminNotification() {
      const type    = document.getElementById('notifType').value;
      const title   = document.getElementById('notifTitle').value.trim();
      const message = document.getElementById('notifMessage').value.trim();
      const badge   = document.getElementById('notifBadge').value.trim() || 'Notice';

      if (!title || !message) {
        alert('Title and Message are required.');
        return;
      }

      const btn = document.getElementById('sendNotifBtn');
      const origText = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
      btn.disabled = true;

      const notifId = 'notif_' + Date.now();
      const notifData = { type, title, message, badge, timestamp: Date.now(), sentBy: 'admin' };

      // Save to Firebase — main.js is listening to this path in real-time
      database.ref('adminNotifications/' + notifId).set(notifData)
        .then(() => {
          // Show success toast
          showAdminToast('✅ Notification sent to all users!', 'success');
          clearNotifForm();
          loadNotifHistory();
          btn.innerHTML = origText;
          btn.disabled = false;
        })
        .catch(err => {
          alert('Error: ' + err.message);
          btn.innerHTML = origText;
          btn.disabled = false;
        });
    }

    function clearNotifForm() {
      document.getElementById('notifTitle').value = '';
      document.getElementById('notifMessage').value = '';
      document.getElementById('notifBadge').value = '';
      document.getElementById('notifPreviewBox').style.display = 'none';
    }

    function updateNotifPreview() {
      const title   = document.getElementById('notifTitle').value.trim();
      const message = document.getElementById('notifMessage').value.trim();
      const badge   = document.getElementById('notifBadge').value.trim() || 'Notice';
      const type    = document.getElementById('notifType').value;
      const box = document.getElementById('notifPreviewBox');

      if (!title && !message) { box.style.display = 'none'; return; }
      box.style.display = 'block';

      const colorMap = { offer:'#7c3aed', order:'#16a34a', system:'#0f172a', warning:'#d97706', info:'#1d4ed8' };
      const bar = box.querySelector('div[style*="border-radius:8px"]');
      if (bar) bar.style.background = colorMap[type] || '#1d4ed8';

      const previewBadge = document.getElementById('notifPreviewBadge');
      const previewTitle = document.getElementById('notifPreviewTitle');
      const previewMsg   = document.getElementById('notifPreviewMsg');
      if (previewBadge) previewBadge.textContent = badge;
      if (previewTitle) previewTitle.textContent = title;
      if (previewMsg)   previewMsg.textContent = message;
    }

    function loadNotifHistory() {
      const el = document.getElementById('notifHistoryList');
      if (!el) return;
      el.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:20px">Loading...</p>';
      database.ref('adminNotifications').orderByChild('timestamp').limitToLast(30).once('value', snap => {
        if (!snap.exists()) { el.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:20px">No notifications sent yet.</p>'; return; }
        const notifs = [];
        snap.forEach(c => notifs.unshift({ id: c.key, ...c.val() }));
        const colorMap = { offer:'#7c3aed', order:'#16a34a', system:'#0f172a', warning:'#d97706', info:'#1d4ed8', default:'#1d4ed8' };
        el.innerHTML = notifs.map(n => `
          <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:14px 0;border-bottom:1px solid #e2e8f0;gap:12px;">
            <div style="flex:1">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <span style="background:${colorMap[n.type]||colorMap.default};color:white;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700">${n.badge||n.type}</span>
                <span style="font-weight:600;font-size:14px">${n.title}</span>
              </div>
              <div style="font-size:13px;color:#64748b;margin-bottom:4px">${n.message}</div>
              <div style="font-size:11px;color:#94a3b8">${new Date(n.timestamp).toLocaleString('en-IN')}</div>
            </div>
            <button class="btn btn-danger btn-sm" onclick="deleteNotification('${n.id}')"><i class="fas fa-trash"></i></button>
          </div>
        `).join('');
      });
    }

    function deleteNotification(id) {
      database.ref('adminNotifications/' + id).remove()
        .then(() => { loadNotifHistory(); })
        .catch(err => alert('Error: ' + err.message));
    }

    function clearAllNotifications() {
      if (!confirm('Clear ALL notification history?')) return;
      database.ref('adminNotifications').remove()
        .then(() => { loadNotifHistory(); showAdminToast('Notification history cleared', 'success'); })
        .catch(err => alert('Error: ' + err.message));
    }

    // ── HERO SECTION ─────────────────────────────────────────────────────
    let heroMsgList = [];

    function loadHeroSectionSettings() {
      database.ref('adminSettings').once('value').then(snap => {
        if (!snap.exists()) return;
        const s = snap.val();
        const set = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
        set('heroHeadingControl',    s.heroHeading    || '');
        set('heroSubheadingControl', s.heroSubheading || '');
        set('heroCtaControl',        s.heroCtaText    || 'Shop Now');
        set('heroRatingControl',     s.heroRating     || '');
        set('heroHighlightControl',  s.highlightText  || '');
        set('heroBgControl',         s.heroBgImage    || '');
        heroMsgList = Array.isArray(s.heroMessages) ? s.heroMessages : (s.heroMessages ? s.heroMessages.split('\n').filter(Boolean) : []);
        renderHeroMsgListAdmin();
        updateHeroLivePreview();
        // Load products for rating override select
        database.ref('products').once('value').then(pSnap => {
          const sel = document.getElementById('heroRatingProdSelect');
          if (!sel || !pSnap.exists()) return;
          sel.innerHTML = '<option value="">-- Select from list --</option>';
          pSnap.forEach(c => {
            const p = c.val();
            const opt = document.createElement('option');
            opt.value = c.key;
            opt.textContent = (p.title || p.name || c.key) + ' — ₹' + (p.price || 0);
            sel.appendChild(opt);
          });
        });
      }).catch(() => {});
    }

    function renderHeroMsgListAdmin() {
      const list = document.getElementById('heroMsgListAdmin');
      if (!list) return;
      if (!heroMsgList.length) {
        list.innerHTML = '<p style="color:#94a3b8;font-size:13px;text-align:center;padding:12px">No messages. Add below.</p>';
        return;
      }
      list.innerHTML = heroMsgList.map((msg, i) => `
        <div style="display:flex;align-items:center;gap:8px;background:#f8fafc;padding:8px 12px;border-radius:8px;border:1px solid #e2e8f0;">
          <span style="flex:1;font-size:13px;">${msg}</span>
          <button onclick="removeHeroMsg(${i})" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:18px;line-height:1;">×</button>
        </div>
      `).join('');
    }

    function addHeroMsg() {
      const input = document.getElementById('heroMsgInputAdmin');
      const text = input?.value.trim();
      if (!text) return;
      heroMsgList.push(text);
      input.value = '';
      renderHeroMsgListAdmin();
      updateHeroLivePreview();
    }

    function removeHeroMsg(i) {
      heroMsgList.splice(i, 1);
      renderHeroMsgListAdmin();
      updateHeroLivePreview();
    }

    function previewHeroBgAdmin() {
      const url = document.getElementById('heroBgControl')?.value.trim();
      const preview = document.getElementById('heroBgPreviewAdmin');
      if (url && preview) {
        preview.style.backgroundImage = `url('${url}')`;
        preview.style.backgroundSize = 'cover';
        preview.textContent = '';
      }
      updateHeroLivePreview();
    }

    async function uploadHeroBgImage(event) {
      const file = event.target.files[0];
      if (!file) return;
      const bar = document.getElementById('heroBgUploadBar');
      const prog = document.getElementById('heroBgUploadProgress');
      if (prog) prog.style.display = 'block';
      if (bar) bar.style.width = '40%';
      try {
        const url = await uploadImageToImgBBAdmin(file);
        if (bar) bar.style.width = '100%';
        document.getElementById('heroBgControl').value = url;
        previewHeroBgAdmin();
        setTimeout(() => { if (prog) prog.style.display = 'none'; }, 600);
        showAdminToast(url.startsWith('http') ? 'Hero image uploaded to ImgBB! ✅' : 'Hero image ready (Base64)', 'success');
      } catch(err) {
        alert('Upload error: ' + err.message);
        if (prog) prog.style.display = 'none';
      }
    }
    function updateHeroLivePreview() {
      const heading    = document.getElementById('heroHeadingControl')?.value    || 'Welcome to Buyzo Cart';
      const subheading = document.getElementById('heroSubheadingControl')?.value || 'Fast checkout. Best prices.';
      const cta        = document.getElementById('heroCtaControl')?.value        || 'Shop Now';
      const rating     = document.getElementById('heroRatingControl')?.value     || '★★★★★ 4.9';
      const highlight  = document.getElementById('heroHighlightControl')?.value  || '';
      const bgUrl      = document.getElementById('heroBgControl')?.value.trim()  || '';

      const box    = document.getElementById('heroLivePreviewAdmin');
      const h1el   = document.getElementById('heroPreviewH1');
      const subEl  = document.getElementById('heroPreviewSub');
      const ratEl  = document.getElementById('heroPreviewRat');
      const btnEl  = document.getElementById('heroPreviewBtn');
      const tickEl = document.getElementById('heroPreviewTick');
      const hlEl   = document.getElementById('heroPreviewHighlight');

      if (box) box.style.backgroundImage = bgUrl ? `url('${bgUrl}')` : 'linear-gradient(135deg,#1e293b,#2563eb)';
      if (h1el)   h1el.innerHTML    = heading;
      if (subEl)  subEl.textContent = subheading;
      if (ratEl)  ratEl.textContent = rating;
      if (btnEl)  btnEl.textContent = cta;
      if (tickEl) tickEl.textContent = heroMsgList[0] || '🔥 Add ticker messages...';
      if (hlEl) {
        if (highlight) { hlEl.style.display = 'inline-block'; hlEl.textContent = highlight; }
        else hlEl.style.display = 'none';
      }
    }

    function saveHeroSectionSettings() {
      var headingVal  = document.getElementById('heroHeadingControl') ? document.getElementById('heroHeadingControl').value : '';
      var subVal      = document.getElementById('heroSubheadingControl') ? document.getElementById('heroSubheadingControl').value : '';
      var ctaVal      = document.getElementById('heroCtaControl') ? document.getElementById('heroCtaControl').value : 'Shop Now';
      var ratingVal   = document.getElementById('heroRatingControl') ? document.getElementById('heroRatingControl').value : '';
      var highlightV  = document.getElementById('heroHighlightControl') ? document.getElementById('heroHighlightControl').value : '';
      var bgVal       = document.getElementById('heroBgControl') ? document.getElementById('heroBgControl').value.trim() : '';

      // Save exact values — do NOT apply defaults here — empty = clear on site
      const updates = {
        heroHeading:     headingVal,
        heroSubheading:  subVal,
        heroCtaText:     ctaVal,
        heroRating:      ratingVal,
        highlightText:   highlightV,
        heroBgImage:     bgVal,
        heroMessages:    heroMsgList,
        heroMessagesText: heroMsgList.join('\n'),
        heroUpdatedAt:   Date.now(),
      };

      var btn = document.querySelector('[onclick="saveHeroSectionSettings()"]');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }

      database.ref('adminSettings').update(updates)
        .then(function() {
          showAdminToast('Hero section saved! Live on website now.', 'success');
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save All Changes'; }
        })
        .catch(function(err) {
          alert('Error saving: ' + err.message);
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save All Changes'; }
        });
    }

    function setProductRatingOverride() {
      const productId = document.getElementById('heroRatingProdId')?.value.trim();
      const rating    = parseFloat(document.getElementById('heroRatingVal')?.value);
      if (!productId) { alert('Please enter or select a product ID'); return; }
      if (isNaN(rating) || rating < 0 || rating > 5) { alert('Rating must be between 0 and 5'); return; }
      database.ref('adminRatings/' + productId).set({ rating, updatedAt: Date.now() })
        .then(() => showAdminToast(`✅ Rating ${rating}★ set for product`, 'success'))
        .catch(err => alert('Error: ' + err.message));
    }

    // ── USER LISTINGS ─────────────────────────────────────────────────────
    let allUserListings = [];

    function loadUserListings() {
      const tbody = document.getElementById('userListingsBody');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:#94a3b8">Loading...</td></tr>';

      // Load ALL products then filter for seller + user_listing sources
      database.ref('products').once('value').then(snap => {
        allUserListings = [];
        if (snap.exists()) {
          snap.forEach(c => {
            const p = c.val();
            // Include seller-added products AND user_listing products
            if (p && (p.source === 'seller' || p.source === 'user_listing')) {
              allUserListings.push({ id: c.key, ...p });
            }
          });
          allUserListings.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        }
        renderUserListings(allUserListings);
      }).catch(err => {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--danger)">Error: ${err.message}</td></tr>`;
      });
    }

    function filterUserListings() {
      const term   = (document.getElementById('listingSearch')?.value || '').toLowerCase();
      const status = document.getElementById('listingStatusFilter')?.value || 'all';
      const source = document.getElementById('listingSourceFilter')?.value || 'all';
      const filtered = allUserListings.filter(l => {
        const matchSearch  = !term   || (l.name||l.title||'').toLowerCase().includes(term) || (l.sellerName||'').toLowerCase().includes(term) || (l.sellerId||'').toLowerCase().includes(term);
        const matchStatus  = status === 'all' || l.status === status;
        const matchSource  = source === 'all' || l.source === source;
        return matchSearch && matchStatus && matchSource;
      });
      renderUserListings(filtered);
    }

    function renderUserListings(listings) {
      const tbody = document.getElementById('userListingsBody');
      if (!tbody) return;
      if (!listings.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:#94a3b8">No listings found.</td></tr>';
        return;
      }
      tbody.innerHTML = listings.map(l => {
        const img    = (l.images && l.images[0]) || l.image || 'https://via.placeholder.com/50';
        const date   = l.createdAt ? new Date(l.createdAt).toLocaleDateString('en-IN') : '—';
        const status = l.status || 'active';
        const statusColor = { active:'badge-success', inactive:'badge-warning', pending:'badge-warning' };
        const isSeller = l.source === 'seller';
        const sourceBadge = isSeller
          ? '<span style="background:#eff6ff;color:#2563eb;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700;display:inline-block;margin-top:2px;">🏪 Seller</span>'
          : '<span style="background:#f0fdf4;color:#16a34a;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700;display:inline-block;margin-top:2px;">👤 User</span>';

        // Full seller info with Gmail, phone, seller ID
        const email = l.sellerEmail || l.addedByEmail || '';
        const phone = l.sellerPhone || l.addedByPhone || '';
        const sid   = l.sellerId || l.addedBy || '';
        const sname = l.sellerName || l.addedByName || 'Unknown';

        const sellerInfo = `
          <div style="font-weight:700;font-size:13px;color:#0f172a;">${sname}</div>
          ${email ? `<div style="font-size:11px;color:#2563eb;cursor:pointer;" onclick="document.getElementById('sellerGmailFilter').value='${email}';filterUserListingsBySeller();" title="Filter by this seller">
            <i class='fas fa-envelope' style='font-size:9px;'></i> ${email}
          </div>` : ''}
          ${phone ? `<div style='font-size:11px;color:#64748b;'><i class='fas fa-phone' style='font-size:9px;'></i> ${phone}</div>` : ''}
          ${sid ? `<div style='font-size:10px;color:#94a3b8;font-family:monospace;cursor:pointer;' onclick="bzCopySellerID('${sid}',this)" title="Copy Seller ID">🆔 ${sid.substring(0,14)}...</div>` : ''}
          ${sourceBadge}`;

        return `<tr>
          <td><img src="${img}" class="product-image" onerror="this.src='https://via.placeholder.com/50'"></td>
          <td style="max-width:160px;">
            <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${l.name||l.title||''}">${l.name||l.title||'—'}</div>
          </td>
          <td style="min-width:160px;">${sellerInfo}</td>
          <td>${l.category||'—'}</td>
          <td style="font-weight:600;">₹${(l.price||0).toLocaleString()}</td>
          <td><span class="badge ${statusColor[status]||'badge-success'}">${status.charAt(0).toUpperCase()+status.slice(1)}</span></td>
          <td>${date}</td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button class="btn btn-success btn-sm" onclick="approveUserListing('${l.id}')" title="Approve"><i class="fas fa-check"></i></button>
              <button class="btn btn-warning btn-sm" onclick="editProduct('${l.id}')" title="Edit"><i class="fas fa-edit"></i></button>
              <button class="btn btn-danger btn-sm" onclick="removeUserListing('${l.id}')" title="Remove"><i class="fas fa-ban"></i></button>
            </div>
          </td>
        </tr>`;
      }).join('');
    }

    function filterUserListingsBySeller() {
      const query = (document.getElementById('sellerGmailFilter').value || '').toLowerCase().trim();
      if (!query) { renderUserListings(allUserListings); return; }
      const filtered = allUserListings.filter(l => {
        const email = (l.sellerEmail||l.addedByEmail||'').toLowerCase();
        const phone = String(l.sellerPhone||l.addedByPhone||'');
        const sid   = (l.sellerId||l.addedBy||'').toLowerCase();
        const name  = (l.sellerName||l.addedByName||'').toLowerCase();
        return email.includes(query) || phone.includes(query) || sid.includes(query) || name.includes(query);
      });
      renderUserListings(filtered);
      const count = document.querySelector('#user-listings .card-body p');
      if (filtered.length === 0) {
        document.getElementById('userListingsBody').innerHTML =
          '<tr><td colspan="8" style="text-align:center;padding:30px;color:#94a3b8">No products found for: <strong>'+query+'</strong></td></tr>';
      }
    }

    function approveUserListing(id) {
      database.ref('products/' + id).update({ status: 'active', approvedAt: Date.now(), approvedBy: 'admin' })
        .then(() => { showAdminToast('✅ Listing approved and visible on store!', 'success'); loadUserListings(); })
        .catch(err => alert('Error: ' + err.message));
    }

    function removeUserListing(id) {
      if (!confirm('Remove this listing from the store?')) return;
      database.ref('products/' + id).update({ status: 'inactive' })
        .then(() => { showAdminToast('Listing removed from store.', 'success'); loadUserListings(); })
        .catch(err => alert('Error: ' + err.message));
    }

    // ── SELLER REQUESTS ───────────────────────────────────────────────────
    function loadSellerRequests() {
      const el = document.getElementById('sellerRequestsList');
      if (!el) return;
      el.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:30px">Loading seller applications...</p>';
      const filter = document.getElementById('sellerReqFilter')?.value || 'pending';

      database.ref('sellerRequests').once('value').then(snap => {
        if (!snap.exists()) {
          el.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:30px">No applications found.</p>';
          return;
        }
        const reqs = [];
        snap.forEach(c => {
          const d = c.val();
          if (filter === 'all' || d.status === filter) reqs.push({ uid: c.key, ...d });
        });
        reqs.sort((a, b) => (b.appliedAt || 0) - (a.appliedAt || 0));

        if (!reqs.length) {
          el.innerHTML = `<p style="color:#94a3b8;text-align:center;padding:30px">No ${filter} applications.</p>`;
          return;
        }

        const statusColors = { pending:'#d97706', approved:'#16a34a', rejected:'#dc2626' };
        const statusBg     = { pending:'#fef3c7', approved:'#dcfce7', rejected:'#fee2e2' };

        el.innerHTML = reqs.map(r => `
          <div style="border:1px solid var(--border);border-radius:10px;padding:18px;margin-bottom:14px;background:var(--card-bg);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
              <div>
                <div style="font-weight:700;font-size:15px;margin-bottom:2px;">${r.businessName || r.name || 'Unknown Business'}</div>
                <div style="font-size:12px;color:var(--text-secondary);">
                  ${r.name} &nbsp;·&nbsp;
                  <a href="javascript:void(0)" onclick="viewSellerActivity('${r.uid}','${(r.email||'').replace(/'/g,"\\'")}','${(r.name||'').replace(/'/g,"\\'")}');event.stopPropagation();" style="color:var(--primary);font-weight:600;text-decoration:underline;" title="View seller activity">${r.email || ''}</a>
                  &nbsp;·&nbsp; ${r.phone || ''}
                </div>
              </div>
              <span style="background:${statusBg[r.status]||'#f1f5f9'};color:${statusColors[r.status]||'#64748b'};
                padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;white-space:nowrap;">
                ${(r.status||'pending').charAt(0).toUpperCase()+(r.status||'pending').slice(1)}
              </span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;font-size:13px;color:var(--text-secondary);margin-bottom:12px;">
              ${r.fullName || r.name ? `<div>👤 <strong>Full Name:</strong> ${r.fullName||r.name||'—'}</div>` : ''}
              ${r.phone ? `<div>📞 <strong>Phone:</strong> ${r.phone}</div>` : ''}
              ${r.shopName || r.businessName ? `<div>🏪 <strong>Shop:</strong> ${r.shopName||r.businessName||'—'}</div>` : ''}
              <div>📦 <strong>Category:</strong> ${r.category || '—'}</div>
              ${r.gst ? `<div>📋 <strong>GST:</strong> ${r.gst}</div>` : ''}
              ${r.about || r.description ? `<div style="grid-column:1/-1;background:#f8fafc;border-radius:8px;padding:8px 12px;"><strong>📝 About:</strong> ${r.about||r.description}</div>` : ''}
              <div>🏦 <strong>Bank:</strong> ${r.bankName || '—'}</div>
              <div>💳 <strong>A/C:</strong> ${r.accountNumber || '—'}</div>
              <div>🔑 <strong>IFSC:</strong> ${r.ifsc || '—'}</div>
              <div>📅 <strong>Applied:</strong> ${r.appliedAt ? new Date(r.appliedAt).toLocaleDateString('en-IN') : '—'}</div>
              <div style="grid-column:1/-1;display:flex;align-items:center;gap:8px;padding:6px 10px;background:#eff6ff;border-radius:8px;">
                🆔 <strong>Seller ID (UID):</strong>
                <code style="background:#dbeafe;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;word-break:break-all;flex:1;">${r.uid || '—'}</code>
                <button onclick="bzCopySellerID('${r.uid||''}',this)" style="background:none;border:1px solid #bfdbfe;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:11px;color:#2563eb;" title="Copy Seller ID">📋 Copy</button>
              </div>
            </div>
            ${r.description ? `<div style="background:var(--bg-secondary);padding:8px 12px;border-radius:8px;font-size:13px;margin-bottom:12px;">${r.description}</div>` : ''}
            ${r.status === 'pending' ? `
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-sm" style="background:#16a34a;" onclick="approveSellerRequest('${r.uid}','${(r.name||'').replace(/'/g,"\\'")}')">
                <i class="fas fa-check"></i> Approve
              </button>
              <button class="btn btn-sm btn-danger" onclick="rejectSellerRequest('${r.uid}')">
                <i class="fas fa-times"></i> Reject
              </button>
            </div>` : r.status === 'approved' ? `
            <div style="display:flex;gap:8px;">
              <button class="btn btn-sm btn-danger" onclick="rejectSellerRequest('${r.uid}')">Revoke Access</button>
            </div>` : `
            <div style="display:flex;gap:8px;">
              <button class="btn btn-sm" style="background:#16a34a;" onclick="approveSellerRequest('${r.uid}','${(r.name||'').replace(/'/g,"\\'")}')">Re-Approve</button>
            </div>`}
          </div>
        `).join('');
      }).catch(err => {
        el.innerHTML = `<p style="color:var(--danger);text-align:center;padding:20px">Error: ${err.message}</p>`;
      });
    }

    function approveSellerRequest(uid, name) {
      if (!confirm('Approve seller: ' + name + '?\nThey will get full seller dashboard access.')) return;
      database.ref('sellerRequests/' + uid).update({
        status: 'approved', approvedAt: Date.now(), approvedBy: 'admin'
      }).then(() => {
        logSharedAdminActivity('seller_approve', 'Seller Approve kiya: ' + name, 'UID: ' + uid);
        showAdminToast('✅ Seller approved! They can now access their dashboard.', 'success');
        loadSellerRequests();
      }).catch(err => alert('Error: ' + err.message));
    }

    function rejectSellerRequest(uid) {
      const reason = prompt('Enter rejection reason (optional):') || '';
      database.ref('sellerRequests/' + uid).update({
        status: 'rejected', rejectedAt: Date.now(), rejectedBy: 'admin',
        rejectionReason: reason
      }).then(() => {
        logSharedAdminActivity('seller_reject', 'Seller Reject kiya', 'UID: ' + uid + (reason ? ' | Reason: ' + reason : ''));
        showAdminToast('Seller request rejected.', 'success');
        loadSellerRequests();
      }).catch(err => alert('Error: ' + err.message));
    }

    // ── ANALYTICS ─────────────────────────────────────────────────────────
    function loadAnalytics() {
      // Orders count + revenue
      database.ref('orders').once('value').then(snap => {
        const orders = snap.val() || {};
        const list = Object.values(orders);
        document.getElementById('analTotalOrders').textContent = list.length.toLocaleString();
        const revenue = list.reduce((s, o) => s + (parseFloat(o.totalAmount) || 0), 0);
        document.getElementById('analRevenue').textContent = '₹' + revenue.toLocaleString('en-IN');

        // Orders by status
        const statusCount = {};
        list.forEach(o => { const s = o.status||'confirmed'; statusCount[s] = (statusCount[s]||0)+1; });
        const statusColors = { confirmed:'#2563eb', shipped:'#d97706', delivered:'#16a34a', cancelled:'#ef4444' };
        document.getElementById('orderStatusChart').innerHTML = Object.entries(statusCount).map(([s,c]) => `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div style="flex:1;background:#f1f5f9;border-radius:6px;height:28px;overflow:hidden;position:relative;">
              <div style="height:100%;background:${statusColors[s]||'#94a3b8'};width:${Math.round((c/list.length)*100)}%;border-radius:6px;transition:width 0.5s;"></div>
              <span style="position:absolute;inset:0;display:flex;align-items:center;padding:0 10px;font-size:13px;font-weight:600;">${s.charAt(0).toUpperCase()+s.slice(1)}: ${c}</span>
            </div>
            <span style="font-size:13px;color:#64748b;width:40px;text-align:right">${Math.round((c/list.length)*100)}%</span>
          </div>
        `).join('') || '<p style="color:#94a3b8;text-align:center;padding:20px">No order data</p>';

        // Top products
        const productSales = {};
        list.forEach(o => {
          const k = o.productName || o.title || 'Unknown';
          productSales[k] = (productSales[k]||0) + 1;
        });
        const topProds = Object.entries(productSales).sort((a,b)=>b[1]-a[1]).slice(0,5);
        document.getElementById('topProductsList').innerHTML = topProds.length
          ? topProds.map(([name, cnt], i) => `
              <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #e2e8f0;">
                <span style="background:${i===0?'#fef3c7':i===1?'#f1f5f9':'#f8fafc'};color:#334155;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;">${i+1}</span>
                <span style="flex:1;font-size:13px;font-weight:500;">${name}</span>
                <span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">${cnt} orders</span>
              </div>
            `).join('')
          : '<p style="color:#94a3b8;text-align:center;padding:20px">No sales data</p>';
      }).catch(() => {});

      // Users count
      database.ref('users').once('value').then(snap => {
        const count = snap.exists() ? Object.keys(snap.val()).length : 0;
        document.getElementById('analUsers').textContent = count.toLocaleString();
      }).catch(() => {});

      // Products views
      database.ref('products').once('value').then(snap => {
        let totalViews = 0;
        if (snap.exists()) snap.forEach(c => { totalViews += parseInt(c.val().views || 0); });
        document.getElementById('analTotalViews').textContent = totalViews.toLocaleString();
      }).catch(() => {});

      // Top searches
      database.ref('searchTags').once('value').then(snap => {
        const el = document.getElementById('topSearchesList');
        if (!snap.exists()) { el.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:20px">No search data</p>'; return; }
        const tags = [];
        snap.forEach(c => tags.push({ name: c.val().name || c.key, count: c.val().searchCount || 0 }));
        tags.sort((a,b) => b.count - a.count);
        el.innerHTML = tags.slice(0,8).map(t => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #e2e8f0;">
            <span style="font-size:13px;">🔍 ${t.name}</span>
            <span style="background:#f1f5f9;padding:2px 8px;border-radius:12px;font-size:12px;color:#64748b">${t.count}</span>
          </div>
        `).join('') || '<p style="color:#94a3b8;text-align:center">No data</p>';
      }).catch(() => {});

      // Recent activity
      database.ref('loginActivity').limitToLast(10).once('value').then(snap => {
        const el = document.getElementById('recentActivityList');
        if (!snap.exists()) { el.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:20px">No activity logged</p>'; return; }
        const acts = [];
        snap.forEach(uid => uid.forEach(a => acts.push({ uid: uid.key, ...a.val() })));
        acts.sort((a,b) => b.timestamp - a.timestamp);
        el.innerHTML = acts.slice(0,8).map(a => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #e2e8f0;">
            <div style="width:32px;height:32px;background:var(--primary);border-radius:50%;color:white;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;">U</div>
            <div style="flex:1;overflow:hidden;">
              <div style="font-size:13px;font-weight:500;">Login — ${a.deviceType||'Unknown Device'}</div>
              <div style="font-size:11px;color:#94a3b8;">${new Date(a.timestamp).toLocaleString('en-IN')}</div>
            </div>
          </div>
        `).join('') || '<p style="color:#94a3b8;text-align:center">No data</p>';
      }).catch(() => {});
    }

    // ── ADMIN TOAST ───────────────────────────────────────────────────────
    function showAdminToast(msg, type = 'success') {
      const existingToast = document.getElementById('adminToastMsg');
      const toast = existingToast || document.createElement('div');
      if (!existingToast) {
        toast.id = 'adminToastMsg';
        toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);color:white;padding:12px 24px;border-radius:50px;font-size:14px;font-weight:500;z-index:99999;opacity:0;transition:all 0.3s;pointer-events:none;white-space:nowrap;max-width:90vw;text-align:center;';
        document.body.appendChild(toast);
      }
      toast.textContent = msg;
      toast.style.background = type === 'success' ? '#16a34a' : type === 'error' ? '#dc2626' : '#1d4ed8';
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => { toast.style.opacity='0'; toast.style.transform='translateX(-50%) translateY(20px)'; }, 3500);
    }

    // ── ENHANCED loadSettings (also loads hero settings from adminSettings) ──

    // Reviews
    let _reviewFilter = 'pending';

    function filterReviews(filter) {
      _reviewFilter = filter;
      loadAdminReviews();
    }

    function loadAdminReviews() {
      const el = document.getElementById('reviewsAdminList');
      if (!el) return;
      el.innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8;">Loading reviews...</div>';

      database.ref('reviews').once('value').then(snap => {
        if (!snap.exists()) { el.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:30px;">No reviews found.</p>'; return; }
        let reviews = Object.entries(snap.val()).map(([k,v]) => ({id:k,...v}));
        if (_reviewFilter === 'pending') reviews = reviews.filter(r => r.status === 'pending' || !r.status);
        else if (_reviewFilter === 'approved') reviews = reviews.filter(r => r.status === 'approved');
        reviews.sort((a,b) => (b.date||0) - (a.date||0));
        if (!reviews.length) { el.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:30px;">No reviews.</p>'; return; }

        el.innerHTML = '';
        reviews.forEach(r => {
          const stars = '★'.repeat(r.rating||0) + '☆'.repeat(5-(r.rating||0));
          const statusColor = r.status === 'approved' ? '#22c55e' : r.status === 'rejected' ? '#ef4444' : '#f59e0b';
          const card = document.createElement('div');
          card.style.cssText = 'background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:12px;';
          card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div>
                <strong>${r.userName||'User'}</strong> <span style="color:#f59e0b;">${stars}</span>
                <div style="font-size:13px;margin:6px 0;">${r.text||''}</div>
                <div style="font-size:11px;color:#94a3b8;">${r.date ? new Date(r.date).toLocaleDateString() : ''}</div>
              </div>
              <div>
                ${r.status !== 'approved' ? `<button class="btn btn-success btn-sm" onclick="approveReview('${r.id}')">Approve</button>` : ''}
                <button class="btn btn-danger btn-sm" onclick="deleteAdminReview('${r.id}')">Delete</button>
              </div>
            </div>`;
          el.appendChild(card);
        });
      }).catch(err => { el.innerHTML = '<p style="color:#ef4444;">Error: ' + err.message + '</p>'; });
    }

    function approveReview(reviewId) {
      database.ref('reviews/' + reviewId).update({ status: 'approved' })
        .then(() => { loadAdminReviews(); })
        .catch(err => alert('Error: ' + err.message));
    }

    function deleteAdminReview(reviewId) {
      if (!confirm('Delete this review?')) return;
      database.ref('reviews/' + reviewId).remove()
        .then(() => { loadAdminReviews(); })
        .catch(err => alert('Error: ' + err.message));
    }

    // Online users tracking
    function setupOnlineUsersTracking() {
      database.ref('presence').on('value', snap => {
        const count = snap.exists() ? Object.keys(snap.val() || {}).length : 0;
        const el = document.getElementById('onlineUsersCount');
        if (el) el.textContent = count;
      });
    }

    function setupRealtimeOrderListener() {
      database.ref('orders').limitToLast(1).on('child_added', () => {
        if (currentAdminTab === 'dashboard') loadDashboardData();
        if (currentAdminTab === 'orders') loadOrders();
      });
    }

    /* ══════════════════════════════════════════════
       SWIPE GESTURE: swipe right to open sidebar,
       swipe left to close — mobile UX improvement
       ══════════════════════════════════════════════ */
    (function initSwipeGesture() {
      let touchStartX = 0;
      let touchStartY = 0;
      const SWIPE_THRESHOLD = 60;   // px to trigger swipe
      const EDGE_ZONE      = 30;    // px from left edge to trigger open

      document.addEventListener('touchstart', function(e) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }, { passive: true });

      document.addEventListener('touchend', function(e) {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;

        /* Only handle mostly-horizontal swipes */
        if (Math.abs(dy) > Math.abs(dx) * 0.8) return;

        const sidebar = document.getElementById('adminSidebar');
        if (!sidebar) return;

        /* Swipe RIGHT from left edge → open sidebar */
        if (dx > SWIPE_THRESHOLD && touchStartX < EDGE_ZONE && !sidebar.classList.contains('active')) {
          if (window.innerWidth <= 1024) toggleSidebar();
        }

        /* Swipe LEFT when sidebar open → close sidebar */
        if (dx < -SWIPE_THRESHOLD && sidebar.classList.contains('active')) {
          closeSidebar();
        }
      }, { passive: true });
    })();

    /* ══════════════════════════════════════════════
       PREVENT GREY/BLANK SCREEN:
       Ensure body background is always set.
       ══════════════════════════════════════════════ */
    document.body.style.backgroundColor = '#f1f5f9';
    document.body.style.minHeight = '100vh';

    window.addEventListener('DOMContentLoaded', initAdminPanel);

    /* ══ SELLER LOOKUP (inside main script — has access to database) ══ */
    window.openSellerLookup = function() {
      var inp = document.getElementById('sellerLookupInput');
      if(inp) inp.value = '';
      var rd = document.getElementById('sellerLookupResult');
      if(rd) rd.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:20px;">Enter Seller ID, Gmail or Phone Number</p>';
      var m = document.getElementById('sellerLookupModal');
      if(m) m.classList.add('active');
      if(typeof closeSidebar === 'function') setTimeout(closeSidebar, 50);
    };

    window.runSellerLookup = async function() {
      var rawInput = (document.getElementById('sellerLookupInput').value || '').trim();
      var res = document.getElementById('sellerLookupResult');
      if(!rawInput) { res.innerHTML = '<p style="color:#ef4444;text-align:center;padding:16px;">Please enter a Seller ID, Gmail or Phone Number</p>'; return; }
      res.innerHTML = '<div style="text-align:center;padding:30px;"><i class="fas fa-spinner fa-spin" style="font-size:28px;color:#2563eb;"></i><p style="color:#94a3b8;margin-top:12px;font-size:13px;">Searching...</p></div>';

      const isEmail = rawInput.includes('@');
      const cleanNum = rawInput.replace(/[\s\-\+\(\)]/g, '');
      const isPhone  = /^\d{7,15}$/.test(cleanNum);
      let u = null, uid = null, sellerReq = null;

      try {
        /* 1. Find user */
        if (isEmail) {
          const s = await database.ref('users').orderByChild('email').equalTo(rawInput).once('value');
          if (s.exists()) s.forEach(c => { u = c.val(); uid = c.key; });
          if (!u) {
            const all = await database.ref('users').once('value');
            if (all.exists()) all.forEach(c => { const d = c.val(); if (!u && d && d.email && d.email.toLowerCase() === rawInput.toLowerCase()) { u = d; uid = c.key; } });
          }
          const sr = await database.ref('sellerRequests').once('value');
          if (sr.exists()) sr.forEach(c => { const d = c.val(); if (!sellerReq && d && d.email && d.email.toLowerCase() === rawInput.toLowerCase()) { sellerReq = d; if (!uid) uid = c.key; } });
        } else if (isPhone) {
          const all = await database.ref('users').once('value');
          if (all.exists()) all.forEach(c => { const d = c.val(); if (!u && d && d.phone && String(d.phone).replace(/\D/g,'').endsWith(cleanNum.slice(-10))) { u = d; uid = c.key; } });
          const sr = await database.ref('sellerRequests').once('value');
          if (sr.exists()) sr.forEach(c => { const d = c.val(); if (d && d.phone && String(d.phone).replace(/\D/g,'').endsWith(cleanNum.slice(-10))) { if (!sellerReq) sellerReq = d; if (!uid) uid = c.key; if (!u) u = { displayName: d.name || d.fullName, email: d.email, phone: d.phone }; } });
        } else {
          const du = await database.ref('users/' + rawInput).once('value');
          if (du.exists()) { u = du.val(); uid = rawInput; }
          if (!u) { const su = await database.ref('users').orderByChild('uid').equalTo(rawInput).once('value'); if (su.exists()) su.forEach(c => { u = c.val(); uid = c.key; }); }
          const sr = await database.ref('sellerRequests/' + rawInput).once('value');
          if (sr.exists()) { sellerReq = sr.val(); if (!uid) uid = rawInput; }
        }

        /* 2. Build search IDs */
        const ids = [...new Set([uid, rawInput, u && u.uid, sellerReq && sellerReq.uid].filter(Boolean).filter(v => !v.includes('@') && !v.includes('#') && !v.includes('.')))];

        /* 3. Products */
        let prods = [], seenP = {};
        for (const id2 of ids) {
          const [p1, p2] = await Promise.all([
            database.ref('products').orderByChild('sellerId').equalTo(id2).once('value'),
            database.ref('sellerProducts/' + id2).once('value')
          ]);
          if (p1.exists()) p1.forEach(c => { if (!seenP[c.key]) { const d = c.val(); d._id = c.key; prods.push(d); seenP[c.key] = 1; } });
          if (p2.exists()) p2.forEach(c => { if (!seenP[c.key]) { const d = c.val(); d._id = c.key; prods.push(d); seenP[c.key] = 1; } });
        }

        /* 4. Brands */
        let brands = [], seenB = {};
        for (const id2 of ids) {
          const snaps = await Promise.all(['createdBy','uid','userId','sellerId'].map(f => database.ref('brands').orderByChild(f).equalTo(id2).once('value')));
          snaps.forEach(s => { if (s.exists()) s.forEach(c => { if (!seenB[c.key]) { const d = c.val(); d._id = c.key; brands.push(d); seenB[c.key] = 1; } }); });
        }
        if (u && u.brandId && !seenB[u.brandId]) { const b = await database.ref('brands/' + u.brandId).once('value'); if (b.exists()) { const d = b.val(); d._id = u.brandId; brands.push(d); } }

        /* 5. Nothing found */
        if (!u && !sellerReq && !prods.length && !brands.length) {
          res.innerHTML = '<div style="text-align:center;padding:36px 20px;"><i class="fas fa-user-slash" style="font-size:44px;color:#cbd5e1;display:block;margin-bottom:14px;"></i><h3 style="color:#64748b;margin-bottom:8px;">No seller found</h3><p style="color:#94a3b8;font-size:13px;">Searched for: <strong>' + rawInput + '</strong></p></div>';
          return;
        }

        /* 6. Render */
        const sr = sellerReq || {};
        const name  = (u && (u.displayName || u.name)) || sr.name || sr.fullName || 'Unknown Seller';
        const email = (u && u.email) || sr.email || '';
        const phone = (u && u.phone) || sr.phone || '';
        const photo = u && u.photoURL;
        const uidD  = uid || rawInput;
        const sales = prods.reduce((s, p) => s + (parseInt(p.sales) || 0), 0);

        let html = '<div style="display:flex;flex-direction:column;gap:14px;">';

        // Profile
        html += `<div style="background:#f8fafc;border-radius:14px;padding:16px;border:1px solid #e2e8f0;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
            ${photo ? `<img src="${photo}" style="width:52px;height:52px;border-radius:14px;object-fit:cover;flex-shrink:0;">` : `<div style="width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#2563eb,#7c3aed);display:flex;align-items:center;justify-content:center;color:white;font-size:22px;font-weight:800;flex-shrink:0;">${name.charAt(0).toUpperCase()}</div>`}
            <div style="flex:1;min-width:0;">
              <div style="font-weight:800;font-size:15px;color:#0f172a;">${name}</div>
              ${email ? `<div style="font-size:12px;color:#2563eb;">✉️ ${email}</div>` : ''}
              ${phone ? `<div style="font-size:12px;color:#64748b;">📞 ${phone}</div>` : ''}
              <div style="display:flex;align-items:center;gap:6px;margin-top:4px;">
                <span style="font-size:10px;color:#94a3b8;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px;">🆔 ${uidD}</span>
                <button onclick="bzCopyText('${uidD.replace(/'/g,"\\'")}',this)" style="background:#eff6ff;border:none;color:#2563eb;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:10px;font-weight:700;flex-shrink:0;">📋 Copy ID</button>
              </div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center;">
            <div style="background:white;border-radius:8px;padding:10px;border:1px solid #e2e8f0;"><div style="font-size:1.1rem;font-weight:800;color:#2563eb;">${prods.length}</div><div style="font-size:10px;color:#64748b;font-weight:600;">Products</div></div>
            <div style="background:white;border-radius:8px;padding:10px;border:1px solid #e2e8f0;"><div style="font-size:1.1rem;font-weight:800;color:#16a34a;">${sales}</div><div style="font-size:10px;color:#64748b;font-weight:600;">Total Sales</div></div>
            <div style="background:white;border-radius:8px;padding:10px;border:1px solid #e2e8f0;"><div style="font-size:1.1rem;font-weight:800;color:#7c3aed;">${brands.length}</div><div style="font-size:10px;color:#64748b;font-weight:600;">Brands</div></div>
          </div></div>`;

        // Seller request info
        if (sellerReq && Object.keys(sellerReq).length > 2) {
          html += `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:14px;">
            <div style="font-weight:700;font-size:13px;color:#15803d;margin-bottom:10px;"><i class="fas fa-user-check"></i> Seller Application</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;color:#374151;">
              ${sr.shopName || sr.businessName ? `<div>🏪 <strong>Shop:</strong> ${sr.shopName || sr.businessName}</div>` : ''}
              ${sr.category ? `<div>📦 <strong>Category:</strong> ${sr.category}</div>` : ''}
              ${sr.gst ? `<div>📋 <strong>GST:</strong> ${sr.gst}</div>` : ''}
              ${sr.bankName ? `<div>🏦 <strong>Bank:</strong> ${sr.bankName}</div>` : ''}
              ${sr.accountNumber ? `<div>💳 <strong>A/C:</strong> ${sr.accountNumber}</div>` : ''}
              ${sr.ifsc ? `<div>🔑 <strong>IFSC:</strong> ${sr.ifsc}</div>` : ''}
              ${sr.status ? `<div>📌 <strong>Status:</strong> ${sr.status}</div>` : ''}
            </div></div>`;
        }

        // Brands
        if (brands.length) {
          html += `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:14px;">
            <div style="font-weight:700;font-size:13px;color:#1d4ed8;margin-bottom:10px;"><i class="fas fa-award"></i> Brands (${brands.length})</div>
            ${brands.map(b => `<div style="display:flex;align-items:center;gap:10px;background:white;border-radius:8px;padding:10px;margin-bottom:6px;">
              ${b.logo ? `<img src="${b.logo}" style="width:32px;height:32px;border-radius:8px;object-fit:cover;">` : `<div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#2563eb,#7c3aed);display:flex;align-items:center;justify-content:center;color:white;font-weight:800;">${(b.name||'B').charAt(0).toUpperCase()}</div>`}
              <div><div style="font-weight:700;font-size:13px;">${b.name||'Brand'}${b.blueTickAdmin ? ' <span style="color:#2563eb;">✓</span>' : ''}</div><div style="font-size:11px;color:#64748b;">${b.category||''}  ${b.status === 'suspended' ? '<span style="color:#ef4444;">· Suspended</span>' : ''}</div></div>
            </div>`).join('')}</div>`;
        }

        // Products
        if (prods.length) {
          window._lookupProducts = {};
          prods.forEach(p => {
            if (p._id) window._lookupProducts[p._id] = p;
            if (p.id && p.id !== p._id) window._lookupProducts[p.id] = p;
          });
          html += `<div><div style="font-weight:700;font-size:13px;color:#374151;margin-bottom:10px;">📦 Products (${prods.length})</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              ${prods.slice(0, 8).map(p => {
                const img = p.image || (p.images && p.images[0]) || '';
                const safeId = p._id.replace(/'/g, "\\'");
                return `<div onclick="openLookupProduct('${safeId}')" style="background:white;border:1.5px solid #e2e8f0;border-radius:10px;overflow:hidden;cursor:pointer;transition:border .2s;" onmouseover="this.style.borderColor='#2563eb'" onmouseout="this.style.borderColor='#e2e8f0'">
                  ${img ? `<img src="${img}" style="width:100%;height:80px;object-fit:cover;">` : `<div style="height:60px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:24px;">📦</div>`}
                  <div style="padding:8px;"><div style="font-size:12px;font-weight:700;color:#0f172a;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${p.name||p.title||'Product'}</div><div style="font-size:12px;color:#2563eb;font-weight:700;">₹${p.price||0}</div></div>
                </div>`;
              }).join('')}
            </div>
            ${prods.length > 8 ? `<p style="font-size:12px;color:#94a3b8;text-align:center;margin-top:8px;">...and ${prods.length - 8} more</p>` : ''}
          </div>`;
        }

        html += '</div>';
        res.innerHTML = html;

      } catch(e) {
        res.innerHTML = `<div style="text-align:center;padding:30px;"><i class="fas fa-exclamation-triangle" style="font-size:36px;color:#f97316;display:block;margin-bottom:12px;"></i><p style="color:#ef4444;font-weight:600;">${e.message}</p></div>`;
      }
    };

    /* ══ UNIVERSAL COPY ══ */
    window.bzCopyText = function(text, btn) {
      if (!text || text === 'undefined') { showAdminToast('Nothing to copy', 'error'); return; }
      const orig = btn ? btn.innerHTML : '';
      const ok = () => { showAdminToast('✅ Copied!', 'success'); if (btn) { btn.innerHTML = '✅'; setTimeout(() => { if(btn) btn.innerHTML = orig; }, 2000); } };
      if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(ok).catch(fb); } else { fb(); }
      function fb() { const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;top:-9999px;left:-9999px;'; document.body.appendChild(t); t.focus(); t.select(); try { document.execCommand('copy'); ok(); } catch(e) { showAdminToast('Copy failed', 'error'); } document.body.removeChild(t); }
    };
    window.bzCopySellerID = (uid, btn) => window.bzCopyText(uid, btn);
  

/* ═══════════════════════════════════════════════════════ */


    // ── SELLER ACTIVITY VIEWER ─────────────────────────────────────────
    async function viewSellerActivity(uid, email, name) {
      document.getElementById('sellerActivityTitle').textContent = '📊 ' + (name || email) + ' — Activity';
      document.getElementById('sellerActivityBody').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px;"><i class="fas fa-spinner fa-spin"></i> Loading seller data...</p>';
      document.getElementById('sellerActivityModal').classList.add('active');

      try {
        const [prodSnap, orderSnap] = await Promise.all([
          database.ref('sellerProducts/' + uid).once('value'),
          database.ref('orders').once('value')
        ]);

        const products = prodSnap.exists()
          ? Object.entries(prodSnap.val()).map(([k, v]) => ({ id: k, ...v }))
          : [];

        const allOrders = orderSnap.exists()
          ? Object.entries(orderSnap.val()).map(([k, v]) => ({ id: k, ...v }))
          : [];

        const sellerOrders = allOrders.filter(o => o.sellerId === uid);
        const revenue = sellerOrders
          .filter(o => (o.status || '').toLowerCase() === 'delivered')
          .reduce((s, o) => s + (parseFloat(o.totalAmount) || 0), 0);
        const pending = sellerOrders.filter(o => ['pending','confirmed'].includes((o.status||'').toLowerCase())).length;

        const statusColors = {confirmed:'#dbeafe',shipped:'#fef3c7',delivered:'#dcfce7',cancelled:'#fee2e2'};
        const statusText   = {confirmed:'#1d4ed8',shipped:'#d97706',delivered:'#16a34a',cancelled:'#dc2626'};

        document.getElementById('sellerActivityBody').innerHTML = `
          <p style="font-size:12px;color:#64748b;margin-bottom:14px;"><i class="fas fa-envelope" style="color:#2563eb;margin-right:4px;"></i>${email}</p>

          <!-- Stats -->
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px;">
            <div style="background:#eff6ff;border-radius:10px;padding:16px;text-align:center;">
              <div style="font-size:1.8rem;font-weight:800;color:#2563eb;">${products.length}</div>
              <div style="font-size:12px;color:#64748b;font-weight:500;">Products Listed</div>
            </div>
            <div style="background:#f0fdf4;border-radius:10px;padding:16px;text-align:center;">
              <div style="font-size:1.8rem;font-weight:800;color:#16a34a;">${sellerOrders.length}</div>
              <div style="font-size:12px;color:#64748b;font-weight:500;">Total Orders</div>
            </div>
            <div style="background:#fef9c3;border-radius:10px;padding:16px;text-align:center;">
              <div style="font-size:1.8rem;font-weight:800;color:#d97706;">${pending}</div>
              <div style="font-size:12px;color:#64748b;font-weight:500;">Pending Orders</div>
            </div>
            <div style="background:#fdf4ff;border-radius:10px;padding:16px;text-align:center;">
              <div style="font-size:1.1rem;font-weight:800;color:#7c3aed;">₹${revenue.toLocaleString('en-IN')}</div>
              <div style="font-size:12px;color:#64748b;font-weight:500;">Revenue (Delivered)</div>
            </div>
          </div>

          <!-- Products -->
          <div style="margin-bottom:20px;">
            <h4 style="margin-bottom:10px;font-size:14px;font-weight:700;border-bottom:1px solid #e2e8f0;padding-bottom:8px;">📦 Products Listed</h4>
            ${products.length ? `
              <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                  <thead><tr style="background:#f8fafc;">
                    <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0;">Image</th>
                    <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0;">Name</th>
                    <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0;">Price</th>
                    <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0;">Stock</th>
                    <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0;">Status</th>
                  </tr></thead>
                  <tbody>
                    ${products.slice(0,10).map(p => `
                      <tr>
                        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;">
                          <img src="${(p.images&&p.images[0])||'https://placehold.co/40'}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;" onerror="this.src='https://placehold.co/40'">
                        </td>
                        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-weight:500;">${p.title||'N/A'}</td>
                        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;">₹${(p.price||0).toLocaleString()}</td>
                        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;">${p.stock||0}</td>
                        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;">
                          <span style="background:${p.status==='active'?'#dcfce7':'#fee2e2'};color:${p.status==='active'?'#16a34a':'#dc2626'};padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">${p.status||'active'}</span>
                        </td>
                      </tr>`).join('')}
                    ${products.length > 10 ? `<tr><td colspan="5" style="text-align:center;padding:8px;color:#94a3b8;font-size:12px;">...and ${products.length-10} more</td></tr>` : ''}
                  </tbody>
                </table>
              </div>` : '<p style="color:#94a3b8;text-align:center;padding:20px;">No products listed yet</p>'}
          </div>

          <!-- Orders -->
          <div>
            <h4 style="margin-bottom:10px;font-size:14px;font-weight:700;border-bottom:1px solid #e2e8f0;padding-bottom:8px;">📋 Orders Received</h4>
            ${sellerOrders.length ? `
              <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                  <thead><tr style="background:#f8fafc;">
                    <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0;">Order ID</th>
                    <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0;">Product</th>
                    <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0;">Amount</th>
                    <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0;">Status</th>
                    <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0;">Date</th>
                  </tr></thead>
                  <tbody>
                    ${sellerOrders.slice().sort((a,b)=>(b.orderDate||0)-(a.orderDate||0)).slice(0,8).map(o => {
                      const s = (o.status||'confirmed').toLowerCase();
                      return `<tr>
                        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-weight:600;">${o.orderId||'#'+o.id.slice(-6).toUpperCase()}</td>
                        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;">${o.productName||'N/A'}</td>
                        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-weight:600;">₹${(o.totalAmount||0).toLocaleString()}</td>
                        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;">
                          <span style="background:${statusColors[s]||'#f1f5f9'};color:${statusText[s]||'#334155'};padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">${s}</span>
                        </td>
                        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b;">${o.orderDate?new Date(o.orderDate).toLocaleDateString('en-IN'):'N/A'}</td>
                      </tr>`;
                    }).join('')}
                    ${sellerOrders.length > 8 ? `<tr><td colspan="5" style="text-align:center;padding:8px;color:#94a3b8;font-size:12px;">...and ${sellerOrders.length-8} more</td></tr>` : ''}
                  </tbody>
                </table>
              </div>` : '<p style="color:#94a3b8;text-align:center;padding:20px;">No orders yet</p>'}
          </div>
        `;
      } catch(err) {
        document.getElementById('sellerActivityBody').innerHTML = `<p style="color:#ef4444;text-align:center;padding:30px;">Error: ${err.message}</p>`;
      }
    }


    // ═══ RESET HERO SECTION ═══
    function resetHeroSection() {
      if (!confirm('Reset Hero Section to factory defaults? All changes will be removed from the website.')) return;

      var defaults = {
        heroHeading:     'Welcome to <span style="color:var(--accent)">Buyzo Cart</span>',
        heroSubheading:  'Clean, fast checkout. Hand-picked products. Fully responsive UI.',
        heroCtaText:     'Shop Now',
        heroRating:      '',
        highlightText:   '',
        heroBgImage:     '',
        heroMessages:    ['Big Sale Today', 'Free Shipping over Rs.999', 'New Arrivals Just Dropped'],
        heroMessagesText: 'Big Sale Today\nFree Shipping over Rs.999\nNew Arrivals Just Dropped',
        heroUpdatedAt:   Date.now()
      };

      database.ref('adminSettings').update(defaults)
        .then(function() {
          showAdminToast('Hero section reset! Website is back to default.', 'success');
          // Update form fields immediately
          var setV = function(id, val) { var el = document.getElementById(id); if (el) el.value = val; };
          setV('heroHeadingControl',    defaults.heroHeading);
          setV('heroSubheadingControl', defaults.heroSubheading);
          setV('heroCtaControl',        defaults.heroCtaText);
          setV('heroRatingControl',     '');
          setV('heroHighlightControl',  '');
          setV('heroBgControl',         '');
          // Reset ticker list
          heroMsgList = defaults.heroMessages.slice();
          if (typeof renderHeroMsgList === 'function') renderHeroMsgList();
          if (typeof updateHeroLivePreview === 'function') updateHeroLivePreview();
        })
        .catch(function(e) { alert('Error: ' + e.message); });
    }

    // ═══ RESET SITE SETTINGS ═══
    function resetSiteSettings() {
      if (!confirm('Reset Settings to default? Store name/email/etc will be cleared.')) return;
      var defaults = {
        storeName: 'Buyzo Cart', storeEmail: '', storePhone: '',
        storeAddress: '', deliveryCharge: 50, freeShippingOver: 999,
        gatewayChargePercent: 2, maxItemsPerOrder: 6,
        currency: 'INR', updatedAt: Date.now()
      };
      Promise.all([
        database.ref('adminSettings').update(defaults),
        database.ref('settings').set(defaults)
      ]).then(function() {
        showAdminToast('Settings reset to default!', 'success');
        if (typeof loadSettings === 'function') loadSettings();
      }).catch(function(e) { alert('Error: ' + e.message); });
    }



    // ══════════════════════════════════════════════
    //  BRAND MANAGEMENT SYSTEM
    // ══════════════════════════════════════════════
    var _brandsCache = [];

    function loadBrandsPanel() {
      var list = document.getElementById('brandsPanelList');
      if (!list) return;
      list.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:30px"><i class="fas fa-spinner fa-spin"></i> Loading...</p>';

      Promise.all([
        database.ref('products').once('value'),
        database.ref('brands').once('value')
      ]).then(function(results) {
        var prodSnap = results[0], brandSnap = results[1];
        var brandMap  = {}; // key  -> brand object
        var nameToKey = {}; // normalised name -> key  (for merging by name)

        // ── 1. Manual / approved brands node ───────────────────────────
        if (brandSnap.exists()) {
          brandSnap.forEach(function(child) {
            var b = child.val();
            if (!b || !b.name) return;
            var bid  = child.key;
            var norm = b.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            brandMap[bid] = {
              id: bid, name: b.name,
              verified: b.verified || false,
              blueTickAdmin: b.blueTickAdmin || false,
              manuallyAdded: true,
              logo: b.logo || '',
              products: [], totalSales: 0, avgRating: 0, followers: b.followers || 0
            };
            nameToKey[norm] = bid;  // remember name→key mapping
          });
        }

        // ── 2. Auto-generate from products; merge with brands/ by ID then by name ──
        if (prodSnap.exists()) {
          prodSnap.forEach(function(child) {
            var p = child.val();
            if (!p || !p.brand) return;

            // Candidate bid from product field
            var pidBid  = (p.brandId || '').toString().trim();
            var nameBid = p.brand.toLowerCase().replace(/[^a-z0-9]/g, '_');
            var norm    = p.brand.toLowerCase().replace(/[^a-z0-9]/g, '');

            // Resolve to the actual key: prefer explicit brandId, then name-to-key lookup, then computed nameBid
            var bid = (pidBid && brandMap[pidBid]) ? pidBid
                    : (nameToKey[norm] ? nameToKey[norm]    // match by normalised name
                    : (pidBid || nameBid));

            if (!brandMap[bid]) {
              brandMap[bid] = {
                id: bid, name: p.brand,
                verified: false, blueTickAdmin: false,
                manuallyAdded: false,
                logo: '', products: [], totalSales: 0, avgRating: 0, ratings: [], followers: 0
              };
            }
            brandMap[bid].products.push({
              id: child.key,
              name: p.name || p.title,
              price: p.price,
              image: p.image || (p.images && p.images[0]) || ''
            });
            if (p.sales)  brandMap[bid].totalSales += (p.sales || 0);
            if (p.rating) { if (!brandMap[bid].ratings) brandMap[bid].ratings = []; brandMap[bid].ratings.push(p.rating); }
          });
        }

        // ── 3. Calc avg rating + auto-popular flag ─────────────────────
        Object.values(brandMap).forEach(function(b) {
          if (b.ratings && b.ratings.length) {
            b.avgRating = b.ratings.reduce(function(s,r){return s+r;},0) / b.ratings.length;
          }
          if (!b.blueTickAdmin && b.products.length >= 5 && b.avgRating >= 4.0) {
            b.autoPopular = true;
          }
        });

        _brandsCache = Object.values(brandMap).sort(function(a,b) { return b.products.length - a.products.length; });
        renderBrandsPanel(_brandsCache);

        document.getElementById('brandTotalCount').textContent    = _brandsCache.length;
        document.getElementById('brandVerifiedCount').textContent = _brandsCache.filter(function(b){return b.blueTickAdmin;}).length;
      }).catch(function(e) {
        list.innerHTML = '<p style="color:#ef4444;text-align:center;padding:20px;">Error: ' + e.message + '</p>';
      });
    }

    function filterBrandsPanel() {
      var q = (document.getElementById('brandSearchAdmin').value || '').toLowerCase();
      var filtered = q ? _brandsCache.filter(function(b){ return b.name.toLowerCase().includes(q); }) : _brandsCache;
      renderBrandsPanel(filtered);
    }

    function renderBrandsPanel(brands) {
      var list = document.getElementById('brandsPanelList');
      if (!brands.length) { list.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:30px">No brands found</p>'; return; }

      // Popular first, then others
      var popular = brands.filter(function(b){ return b.blueTickAdmin || b.autoPopular; });
      var others  = brands.filter(function(b){ return !b.blueTickAdmin && !b.autoPopular; });

      var html = '';
      if (popular.length) {
        html += '<div style="font-weight:800;font-size:13px;color:#d97706;margin-bottom:10px;display:flex;align-items:center;gap:6px;"><span>⭐ Popular Brands</span></div>';
        html += popular.map(function(b){ return renderBrandCard(b); }).join('');
      }
      if (others.length) {
        html += '<div style="font-weight:800;font-size:13px;color:#64748b;margin:16px 0 10px;display:flex;align-items:center;gap:6px;"><span>📦 Other Brands</span></div>';
        html += others.map(function(b){ return renderBrandCard(b); }).join('');
      }
      list.innerHTML = html;
    }

    // Global map for brand card button actions (avoids onclick string escaping issues)
    var _brandCardMap = {};

    function renderBrandCard(b) {
      var initials = b.name.slice(0,2).toUpperCase();
      var colors = ['#f97316','#2563eb','#7c3aed','#16a34a','#dc2626','#0369a1'];
      var color = colors[b.name.charCodeAt(0) % colors.length];
      var isPopular = b.blueTickAdmin || b.autoPopular;
      // Safe key: strip all non-alphanumeric for data attribute
      var safeKey = b.id.replace(/[^a-zA-Z0-9]/g, '_');
      _brandCardMap[safeKey] = b;

      var logoHtml = b.logo
        ? '<img src="' + b.logo + '" style="width:44px;height:44px;border-radius:10px;object-fit:cover;" onerror="this.style.display=\'none\'">'
        : '<div style="width:44px;height:44px;border-radius:10px;background:' + color + ';display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:16px;flex-shrink:0;">' + initials + '</div>';

      var tickBtn = b.blueTickAdmin
        ? '<button data-bkey="' + safeKey + '" data-action="removeTick" class="brand-action-btn" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:11px;font-weight:700;">✕ Remove Blue Tick</button>'
        : '<button data-bkey="' + safeKey + '" data-action="grantTick" class="brand-action-btn" style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:11px;font-weight:700;">✓ Grant Blue Tick</button>';

      var prodBtn = '<button data-bkey="' + safeKey + '" data-action="viewProds" class="brand-action-btn" style="background:#f8fafc;color:#475569;border:1px solid #e2e8f0;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:11px;font-weight:600;">📦 Products (' + b.products.length + ')</button>';

      var statusBadge = b.status === 'suspended'
        ? '<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">SUSPENDED</span>'
        : (b.isAdminBrand ? '<span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">ADMIN BRAND</span>' : '');

      var suspendBtn = b.status === 'suspended'
        ? '<button data-bkey="' + safeKey + '" data-action="activateBrand" class="brand-action-btn" style="background:#f0fdf4;color:#16a34a;border:1px solid #86efac;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:11px;font-weight:700;">✓ Activate</button>'
        : '<button data-bkey="' + safeKey + '" data-action="suspendBrand" class="brand-action-btn" style="background:#fff7ed;color:#ea580c;border:1px solid #fed7aa;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:11px;font-weight:700;">⊘ Suspend</button>';

      var deleteBtn = '<button data-bkey="' + safeKey + '" data-action="deleteBrand" class="brand-action-btn" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:11px;font-weight:700;">🗑 Delete</button>';

      return '<div style="background:#fff;border:1px solid ' + (b.status === 'suspended' ? '#fca5a5' : '#e2e8f0') + ';border-radius:12px;padding:14px 16px;margin-bottom:10px;' + (isPopular ? 'border-left:3px solid #f97316;' : '') + '">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">'
        + '<div style="display:flex;align-items:center;gap:12px;flex:1;min-width:180px;">'
        + logoHtml
        + '<div>'
        + '<div style="font-weight:800;font-size:15px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' + b.name
        + (b.blueTickAdmin ? ' <span title="Blue Tick" style="color:#2563eb;font-size:14px;">✓</span>' : '')
        + (b.autoPopular && !b.blueTickAdmin ? ' <span style="background:#fef3c7;color:#d97706;font-size:10px;padding:1px 6px;border-radius:10px;font-weight:600;">AUTO</span>' : '')
        + ' ' + statusBadge
        + '</div>'
        + '<div style="font-size:12px;color:#64748b;">' + b.products.length + ' products &bull; ' + (b.followers || 0) + ' followers &bull; ' + (b.avgRating ? b.avgRating.toFixed(1) + '★' : 'No rating') + '</div>'
        // Show owner info
        + (b.ownerEmail || b.createdBy ? '<div style="font-size:11px;margin-top:3px;display:flex;align-items:center;gap:4px;flex-wrap:wrap;">'
          + '<span style="color:#94a3b8;">👤 Added by:</span>'
          + '<a href="javascript:void(0)" onclick="document.getElementById(\'sellerGmailFilter\')&&(document.getElementById(\'sellerGmailFilter\').value=\'' + (b.ownerEmail||b.createdBy||'') + '\');if(typeof filterUserListingsBySeller===\'function\')filterUserListingsBySeller();showTab(\'user-listings\');" style="color:#2563eb;font-weight:600;font-size:11px;" title="See this seller\'s listings">'
          + (b.ownerEmail || b.createdBy || '') + '</a>'
          + (b.ownerPhone ? ' &bull; <span style="color:#64748b;">📞 ' + b.ownerPhone + '</span>' : '')
          + '</div>' : '')
        + '</div></div>'
        + '</div>'
        + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid #f1f5f9;">'
        + tickBtn + prodBtn + suspendBtn + deleteBtn
        + '</div></div>';
    }

    // Single delegated event listener for all brand card buttons
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('.brand-action-btn');
      if (!btn) return;
      var key    = btn.getAttribute('data-bkey');
      var action = btn.getAttribute('data-action');
      var b      = _brandCardMap[key];
      if (!b) return;
      if (action === 'grantTick')    grantBlueTick(b.id, b.name);
      if (action === 'removeTick')   removeBlueTick(b.id, b.name);
      if (action === 'viewProds')    viewBrandProducts(b.id, b.name);
      if (action === 'suspendBrand') suspendBrand(b.id);
      if (action === 'activateBrand') activateBrand(b.id);
      if (action === 'deleteBrand')  deleteBrand(b.id, b.isAdminBrand);
    });

    function grantBlueTick(brandId, brandName) {
      if (!confirm('Grant Blue Tick ✓ to "' + brandName + '"?')) return;
      // Disable both buttons to prevent double-click
      var allBtns = document.querySelectorAll('[onclick*="grantBlueTick"][onclick*="' + brandId.replace(/"/g,'') + '"]');
      allBtns.forEach(function(b){ b.disabled = true; b.textContent = '⏳ Saving...'; });

      // Use set with priority: first read existing data, then merge
      database.ref('brands/' + brandId).once('value').then(function(snap) {
        var existing = snap.exists() ? snap.val() : {};
        return database.ref('brands/' + brandId).set(Object.assign({}, existing, {
          name: brandName,
          verified: true,
          blueTickAdmin: true,
          blueTickAt: Date.now()
        }));
      }).then(function() {
        // Log the action
        return database.ref('activityLog').push({
          action: 'brand_blueTick',
          brandId: brandId,
          brandName: brandName,
          timestamp: Date.now(),
          adminNote: 'Blue tick granted'
        });
      }).then(function() {
        showAdminToast('✅ Blue Tick granted to "' + brandName + '"!', 'success');
        loadBrandsPanel();
      }).catch(function(e) {
        showAdminToast('❌ Error: ' + e.message, 'error');
        loadBrandsPanel(); // Reload anyway to reset button state
      });
    }

    function removeBlueTick(brandId) {
      if (!confirm('Remove Blue Tick from this brand?')) return;
      database.ref('brands/' + brandId).once('value').then(function(snap) {
        var existing = snap.exists() ? snap.val() : {};
        return database.ref('brands/' + brandId).set(Object.assign({}, existing, {
          verified: false,
          blueTickAdmin: false,
          blueTickRemovedAt: Date.now()
        }));
      }).then(function() {
        showAdminToast('Blue Tick removed', 'info');
        loadBrandsPanel();
      }).catch(function(e) {
        showAdminToast('❌ Error: ' + e.message, 'error');
        loadBrandsPanel();
      });
    }

    function viewBrandProducts(brandId, brandName) {
      var brand = _brandsCache.find(function(b){ return b.id === brandId; });
      if (!brand) return;
      var existing = document.getElementById('_brandProdModal');
      if (existing) existing.remove();
      var el = document.createElement('div');
      el.id = '_brandProdModal';
      el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;';
      var prods = brand.products.slice(0, 20);
      var prodsHtml = prods.length ? prods.map(function(p) {
        var pid = JSON.stringify(p.id);
        return '<div style="display:flex;align-items:center;gap:10px;padding:10px;background:#f8fafc;border-radius:8px;margin-bottom:8px;">'
          + '<img src="' + (p.image || 'https://placehold.co/44') + '" style="width:44px;height:44px;border-radius:8px;object-fit:cover;">'
          + '<div style="flex:1;"><div style="font-weight:600;font-size:13px;">' + (p.name || 'Product') + '</div>'
          + '<div style="font-size:11px;color:#64748b;">Rs.' + (p.price || 0) + ' | ID: ' + p.id + '</div></div>'
          + '<button onclick="deleteUserListing(' + pid + ')" style="background:#fee2e2;color:#dc2626;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:11px;font-weight:600;">Delete</button>'
          + '</div>';
      }).join('') : '<p style="color:#94a3b8;text-align:center;padding:20px;">No products yet</p>';

      var box = document.createElement('div');
      box.style.cssText = 'background:#fff;border-radius:14px;padding:20px;max-width:540px;width:100%;max-height:88vh;overflow-y:auto;';
      var header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;';
      header.innerHTML = '<h3 style="margin:0;font-weight:800;">' + brandName + ' (' + brand.products.length + ' products)</h3>';
      var closeBtn = document.createElement('button');
      closeBtn.textContent = 'x';
      closeBtn.style.cssText = 'background:none;border:none;font-size:1.4rem;cursor:pointer;';
      closeBtn.onclick = function() { el.remove(); };
      header.appendChild(closeBtn);
      box.appendChild(header);
      box.innerHTML += prodsHtml;
      el.appendChild(box);
      el.addEventListener('click', function(e) { if (e.target === el) el.remove(); });
      document.body.appendChild(el);
    }

    // ── BRAND REQUESTS ────────────────────────────────────────────────────
    function loadBrandRequests() {
      const el = document.getElementById('brandRequestsList');
      if (!el) return;
      el.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:30px">Loading brand requests...</p>';
      const filter = document.getElementById('brandReqFilter') ? document.getElementById('brandReqFilter').value : 'pending';

      database.ref('brandRequests').once('value').then(snap => {
        if (!snap.exists()) {
          el.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:30px">No brand requests found.</p>';
          return;
        }
        const reqs = [];
        snap.forEach(c => {
          const d = c.val();
          if (filter === 'all' || d.status === filter) reqs.push({ _key: c.key, ...d });
        });
        reqs.sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0));

        if (!reqs.length) {
          el.innerHTML = `<p style="color:#94a3b8;text-align:center;padding:30px">No ${filter} brand requests.</p>`;
          return;
        }

        const now = Date.now();
        const AUTO_APPROVE_MS = 24 * 60 * 60 * 1000;

        el.innerHTML = reqs.map(r => {
          const statusColors = { pending:'#d97706', approved:'#16a34a', rejected:'#dc2626' };
          const statusBg = { pending:'#fef3c7', approved:'#dcfce7', rejected:'#fee2e2' };
          const statusLabel = (r.status||'pending').charAt(0).toUpperCase()+(r.status||'pending').slice(1);

          let countdownHtml = '';
          if (r.status === 'pending' && r.requestedAt) {
            const remaining = AUTO_APPROVE_MS - (now - r.requestedAt);
            if (remaining > 0) {
              const hoursLeft = Math.floor(remaining / 3600000);
              const minsLeft = Math.floor((remaining % 3600000) / 60000);
              countdownHtml = `<span style="background:#fef3c7;color:#92400e;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;margin-left:8px;">⏱ Auto-approve in ${hoursLeft}h ${minsLeft}m</span>`;
            } else {
              countdownHtml = `<span style="background:#dcfce7;color:#15803d;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;margin-left:8px;">✅ Eligible for auto-approve</span>`;
            }
          }

          const logoHtml = r.logo
            ? `<img src="${r.logo}" style="width:44px;height:44px;border-radius:10px;object-fit:cover;border:1px solid #e2e8f0;" onerror="this.style.display='none'">`
            : `<div style="width:44px;height:44px;border-radius:10px;background:#7c3aed;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;flex-shrink:0;">${(r.name||'B').slice(0,2).toUpperCase()}</div>`;

          const safeKey    = (r._key||'').replace(/'/g,"\\'");
          const safeName   = (r.name||'').replace(/'/g,"\\'");
          const safeNorm   = (r.normalizedName||'').replace(/'/g,"\\'");
          const safeLogo   = (r.logo||'').replace(/'/g,"\\'");
          const safeDesc   = (r.description||'').replace(/'/g,"\\'");
          const safeBy     = (r.requestedBy||'').replace(/'/g,"\\'");

          return `
          <div style="border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin-bottom:14px;background:#fff;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
              <div style="display:flex;align-items:center;gap:12px;">
                ${logoHtml}
                <div>
                  <div style="font-weight:800;font-size:15px;margin-bottom:2px;">${r.name||'Unknown'} ${countdownHtml}</div>
                  <div style="font-size:12px;color:#64748b;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <span>👤 <strong>${r.requestedByName||r.requestedBy||'—'}</strong></span>
                    ${r.requestedByEmail ? `<span>· <a href="javascript:void(0)" onclick="document.getElementById('sellerGmailFilter')&&(document.getElementById('sellerGmailFilter').value='${(r.requestedByEmail||'').replace(/'/g,"\\'")}');if(typeof filterUserListingsBySeller==='function')filterUserListingsBySeller();showTab('user-listings');" style="color:#2563eb;font-weight:600;" title="See this seller's products">✉️ ${r.requestedByEmail}</a></span>` : ''}
                    ${r.requestedByPhone ? `<span>· 📞 ${r.requestedByPhone}</span>` : ''}
                  </div>
                  ${r.requestedBy ? `<div style="font-size:10px;color:#94a3b8;font-family:monospace;margin-top:2px;cursor:pointer;" onclick="bzCopySellerID('${(r.requestedBy||'').replace(/'/g,"\\'")}',this)" title="Copy Seller ID">🆔 ${(r.requestedBy||'').substring(0,20)}... <small style="color:#2563eb;">(copy)</small></div>` : ''}
                </div>
              </div>
              <span style="background:${statusBg[r.status]||'#f1f5f9'};color:${statusColors[r.status]||'#64748b'};padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">${statusLabel}</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;font-size:13px;color:#64748b;margin-bottom:12px;">
              <div>📅 <strong>Requested:</strong> ${r.requestedAt ? new Date(r.requestedAt).toLocaleDateString('en-IN') : '—'}</div>
              <div>🔑 <strong>Req ID:</strong> <code style="font-size:11px;">${(r._key||'').slice(-8).toUpperCase()}</code></div>
              ${r.category ? `<div>📦 <strong>Category:</strong> ${r.category}</div>` : ''}
              ${r.description ? `<div style="grid-column:1/-1;">📝 ${r.description}</div>` : ''}
              ${r.reason ? `<div style="grid-column:1/-1;">💬 <strong>Reason:</strong> ${r.reason}</div>` : ''}
            </div>
            ${r.status === 'pending' ? `
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-sm" style="background:#16a34a;color:#fff;" onclick="approveBrandRequest('${safeKey}','${safeName}','${safeNorm}','${safeLogo}','${safeDesc}','${safeBy}')">
                <i class="fas fa-check"></i> Approve & Create Brand
              </button>
              <button class="btn btn-sm btn-danger" onclick="rejectBrandRequest('${safeKey}','${safeName}')">
                <i class="fas fa-times"></i> Reject
              </button>
            </div>` : r.status === 'approved' ? `
            <div style="color:#16a34a;font-size:13px;font-weight:600;"><i class="fas fa-check-circle"></i> Approved — Brand created.</div>` : `
            <div style="display:flex;gap:8px;">
              <button class="btn btn-sm" style="background:#16a34a;color:#fff;" onclick="approveBrandRequest('${safeKey}','${safeName}','${safeNorm}','${safeLogo}','${safeDesc}','${safeBy}')">Re-Approve</button>
            </div>`}
          </div>`;
        }).join('');
      }).catch(err => {
        el.innerHTML = `<p style="color:var(--danger);text-align:center;padding:20px">Error: ${err.message}</p>`;
      });
    }

    async function approveBrandRequest(reqKey, brandName, normalizedName, logo, description, requestedBy) {
      if (!confirm('Approve brand "' + brandName + '"? This will create the brand on the store.')) return;
      try {
        const brandId = normalizedName || brandName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        await database.ref('brands/' + brandId).set({
          name: brandName, logo: logo || '', description: description || '',
          verified: false, blueTickAdmin: false, createdAt: Date.now(),
          requestedBy: requestedBy || '', followers: 0, productCount: 0
        });
        await database.ref('brandRequests/' + reqKey).update({
          status: 'approved', approvedAt: Date.now(), approvedBy: 'admin', brandId: brandId
        });
        showAdminToast('✅ Brand "' + brandName + '" approved and created!', 'success');
        loadBrandRequests();
        loadBrandsPanel();
      } catch(err) { alert('Error: ' + err.message); }
    }

    function rejectBrandRequest(reqKey, brandName) {
      const reason = prompt('Rejection reason for "' + brandName + '" (optional):') || '';
      database.ref('brandRequests/' + reqKey).update({
        status: 'rejected', rejectedAt: Date.now(), rejectedBy: 'admin', rejectionReason: reason
      }).then(() => {
        showAdminToast('Brand request rejected.', 'success');
        loadBrandRequests();
      }).catch(err => alert('Error: ' + err.message));
    }

  

/* ═══════════════════════════════════════════════════════ */


// Mark Read storage
var _readOrders    = JSON.parse(localStorage.getItem('bz_read_orders')||'{}');
var _readBrandReq  = JSON.parse(localStorage.getItem('bz_read_brand_req')||'{}');
var _readSellerReq = JSON.parse(localStorage.getItem('bz_read_seller_req')||'{}');

function markOrderRead(id)     { _readOrders[id]=true;    localStorage.setItem('bz_read_orders',JSON.stringify(_readOrders));    var el=document.querySelector('[data-order-id="'+id+'"]');    if(el){var d=el.querySelector('.unread-dot');if(d)d.remove();var b=el.querySelector('.mark-read-btn');if(b)b.remove();el.style.background='';} }
function markBrandReqRead(id)  { _readBrandReq[id]=true;  localStorage.setItem('bz_read_brand_req',JSON.stringify(_readBrandReq));  var el=document.querySelector('[data-brand-req-id="'+id+'"]');  if(el){var d=el.querySelector('.unread-dot');if(d)d.remove();var b=el.querySelector('.mark-read-btn');if(b)b.remove();} }
function markSellerReqRead(id) { _readSellerReq[id]=true; localStorage.setItem('bz_read_seller_req',JSON.stringify(_readSellerReq)); var el=document.querySelector('[data-seller-req-id="'+id+'"]'); if(el){var d=el.querySelector('.unread-dot');if(d)d.remove();var b=el.querySelector('.mark-read-btn');if(b)b.remove();} }

// Auto-mark unread on DOM changes
new MutationObserver(function(){
  document.querySelectorAll('[data-order-id]').forEach(function(r){
    var id=r.getAttribute('data-order-id'); if(_readOrders[id]||r.querySelector('.unread-dot')) return;
    r.style.background='#fef2f2';
    var dot=document.createElement('span'); dot.className='unread-dot'; dot.title='New';
    var fc=r.querySelector('td,div'); if(fc) fc.prepend(dot);
    var btn=document.createElement('button'); btn.className='mark-read-btn'; btn.innerHTML='<i class="fas fa-check"></i> Mark Read'; btn.onclick=function(e){e.stopPropagation();markOrderRead(id);};
    var cells=r.querySelectorAll('td'); var t=cells.length?cells[cells.length-1]:r; t.appendChild(btn);
  });
  document.querySelectorAll('[data-brand-req-id]').forEach(function(el){
    var id=el.getAttribute('data-brand-req-id'); if(_readBrandReq[id]||el.querySelector('.unread-dot')) return;
    var dot=document.createElement('span'); dot.className='unread-dot'; el.prepend(dot);
    var btn=document.createElement('button'); btn.className='mark-read-btn'; btn.innerHTML='<i class="fas fa-check"></i> Mark Read'; btn.onclick=function(e){e.stopPropagation();markBrandReqRead(id);}; el.appendChild(btn);
  });
  document.querySelectorAll('[data-seller-req-id]').forEach(function(el){
    var id=el.getAttribute('data-seller-req-id'); if(_readSellerReq[id]||el.querySelector('.unread-dot')) return;
    var dot=document.createElement('span'); dot.className='unread-dot'; el.prepend(dot);
    var btn=document.createElement('button'); btn.className='mark-read-btn'; btn.innerHTML='<i class="fas fa-check"></i> Mark Read'; btn.onclick=function(e){e.stopPropagation();markSellerReqRead(id);}; el.appendChild(btn);
  });
}).observe(document.body,{childList:true,subtree:true});

// Seller Lookup
function openSellerLookup(){
  var inp=document.getElementById("sellerLookupInput"); if(inp) inp.value="";
  var rd=document.getElementById("sellerLookupResult"); if(rd) rd.innerHTML='<p style="color:#94a3b8;text-align:center;padding:20px;">Enter Seller ID, Gmail or Phone Number</p>';
  var m=document.getElementById("sellerLookupModal"); if(m) m.classList.add("active");
  if(typeof closeSidebar==="function") setTimeout(closeSidebar,50);
  else if(document.getElementById("adminSidebar") && document.getElementById("adminSidebar").classList.contains("active")) setTimeout(toggleSidebar,50);
}
async function runSellerLookup(){
  var rawInput = document.getElementById('sellerLookupInput').value.trim();
  var res = document.getElementById('sellerLookupResult');
  if(!rawInput){ res.innerHTML='<p style="color:#ef4444;text-align:center;padding:16px;">Please enter a Seller ID, Gmail or Phone Number</p>'; return; }

  res.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:24px;"><i class="fas fa-spinner fa-spin" style="font-size:20px;"></i><br><br>Searching...</p>';

  var isEmail = rawInput.includes('@');
  var cleanNum = rawInput.replace(/[\s\-\+\(\)]/g,'');
  var isPhone  = /^\d{7,15}$/.test(cleanNum);
  var u=null, uid=null, sellerReqData=null;

  try{
    /* ── 1. FIND USER ─────────────────────────────── */
    if(isEmail){
      // Try orderByChild first
      var s1 = await database.ref('users').orderByChild('email').equalTo(rawInput).once('value').catch(()=>null);
      if(s1&&s1.exists()) s1.forEach(function(c){ u=c.val(); uid=c.key; });
      // Full scan fallback (handles case differences)
      if(!u){
        var all = await database.ref('users').once('value').catch(()=>null);
        if(all&&all.exists()) all.forEach(function(c){
          if(!u){ var d=c.val(); if(d&&d.email&&d.email.toLowerCase()===rawInput.toLowerCase()){ u=d; uid=c.key; } }
        });
      }
      // Look in sellerRequests by email
      if(!sellerReqData){
        var sr = await database.ref('sellerRequests').once('value').catch(()=>null);
        if(sr&&sr.exists()) sr.forEach(function(c){
          if(!sellerReqData){ var d=c.val();
            if(d&&d.email&&d.email.toLowerCase()===rawInput.toLowerCase()){ sellerReqData=d; if(!uid) uid=c.key; }
          }
        });
      }

    } else if(isPhone){
      var allU = await database.ref('users').once('value').catch(()=>null);
      if(allU&&allU.exists()) allU.forEach(function(c){
        if(!u){ var d=c.val();
          if(d&&d.phone && String(d.phone).replace(/\D/g,'').endsWith(cleanNum.slice(-10))){ u=d; uid=c.key; }
        }
      });
      // sellerRequests by phone
      var srP = await database.ref('sellerRequests').once('value').catch(()=>null);
      if(srP&&srP.exists()) srP.forEach(function(c){
        var d=c.val();
        if(d&&d.phone && String(d.phone).replace(/\D/g,'').endsWith(cleanNum.slice(-10))){
          if(!sellerReqData) sellerReqData=d;
          if(!uid) uid=c.key;
          if(!u) u={ displayName:d.name||d.fullName||'', email:d.email||'', phone:d.phone };
        }
      });

    } else {
      // Seller ID / UID
      var du = await database.ref('users/'+rawInput).once('value').catch(()=>null);
      if(du&&du.exists()){ u=du.val(); uid=rawInput; }
      if(!u){
        var su = await database.ref('users').orderByChild('uid').equalTo(rawInput).once('value').catch(()=>null);
        if(su&&su.exists()) su.forEach(function(c){ u=c.val(); uid=c.key; });
      }
      // Also check sellerRequests
      var srId = await database.ref('sellerRequests/'+rawInput).once('value').catch(()=>null);
      if(srId&&srId.exists()){ sellerReqData=srId.val(); if(!uid) uid=rawInput; }
    }

    /* ── 2. BUILD searchIds (all possible IDs for this seller) ─── */
    var searchIds=[], seenId={};
    function addId(v){ if(v&&!seenId[v]){ searchIds.push(v); seenId[v]=1; } }
    addId(uid);
    addId(rawInput);
    if(u&&u.uid) addId(u.uid);
    if(sellerReqData&&sellerReqData.uid) addId(sellerReqData.uid);

    /* ── 3. PRODUCTS ─────────────────────────────── */
    var prods=[], seenProd={};
    for(var i=0;i<searchIds.length;i++){
      var sid2=searchIds[i];
      if(sid2.includes('@')||sid2.includes('.')||sid2.includes('#')) continue; // skip invalid paths
      var [p1,p2]=await Promise.all([
        database.ref('products').orderByChild('sellerId').equalTo(sid2).once('value').catch(()=>null),
        database.ref('sellerProducts/'+sid2).once('value').catch(()=>null)
      ]);
      if(p1&&p1.exists()) p1.forEach(function(c){ if(!seenProd[c.key]){ var d=c.val();d._id=c.key;d._sellerId=sid2;prods.push(d);seenProd[c.key]=1; }});
      if(p2&&p2.exists()) p2.forEach(function(c){ if(!seenProd[c.key]){ var d=c.val();d._id=c.key;d._sellerId=sid2;prods.push(d);seenProd[c.key]=1; }});
    }
    // Also search products by sellerEmail if we have it
    var sellerEmail = (u&&u.email)||(sellerReqData&&sellerReqData.email)||'';
    if(sellerEmail){
      var pe = await database.ref('products').orderByChild('sellerEmail').equalTo(sellerEmail).once('value').catch(()=>null);
      if(pe&&pe.exists()) pe.forEach(function(c){ if(!seenProd[c.key]){ var d=c.val();d._id=c.key;prods.push(d);seenProd[c.key]=1; }});
    }

    /* ── 4. BRANDS ───────────────────────────────── */
    var brands=[], seenBrand={};
    for(var j=0;j<searchIds.length;j++){
      var bid=searchIds[j];
      if(bid.includes('@')||bid.includes('.')||bid.includes('#')) continue;
      var bSnaps=await Promise.all([
        database.ref('brands').orderByChild('createdBy').equalTo(bid).once('value').catch(()=>null),
        database.ref('brands').orderByChild('uid').equalTo(bid).once('value').catch(()=>null),
        database.ref('brands').orderByChild('userId').equalTo(bid).once('value').catch(()=>null),
        database.ref('brands').orderByChild('sellerId').equalTo(bid).once('value').catch(()=>null)
      ]);
      bSnaps.forEach(function(bs){ if(bs&&bs.exists()) bs.forEach(function(c){ if(!seenBrand[c.key]){ var d=c.val();d._id=c.key;brands.push(d);seenBrand[c.key]=1; }}); });
    }
    if(u&&u.brandId&&!seenBrand[u.brandId]){
      var ub=await database.ref('brands/'+u.brandId).once('value').catch(()=>null);
      if(ub&&ub.exists()){ var bd=ub.val();bd._id=u.brandId;brands.push(bd); }
    }

    /* ── 5. CHECK if anything found ─────────────── */
    if(!u && !sellerReqData && !prods.length && !brands.length){
      res.innerHTML='<div style="text-align:center;padding:40px 20px;">'
        +'<i class="fas fa-user-slash" style="font-size:44px;color:#cbd5e1;display:block;margin-bottom:16px;"></i>'
        +'<h3 style="color:#64748b;margin-bottom:8px;">No seller found</h3>'
        +'<p style="color:#94a3b8;font-size:13px;">Tried searching by: <strong>'+rawInput+'</strong></p>'
        +'<p style="color:#94a3b8;font-size:12px;margin-top:8px;">Make sure the ID/Gmail/Phone is correct</p></div>';
      return;
    }

    /* ── 6. RENDER ───────────────────────────────── */
    var sr = sellerReqData || {};
    var displayName = (u&&(u.displayName||u.name)) || sr.name || sr.fullName || 'Unknown Seller';
    var email       = (u&&u.email) || sr.email || '';
    var phone       = (u&&u.phone) || sr.phone || '';
    var photoURL    = u&&u.photoURL;
    var uidDisplay  = uid || rawInput;
    var totalSales  = prods.reduce(function(s,p){ return s+(parseInt(p.sales)||0); },0);

    var html = '<div style="display:flex;flex-direction:column;gap:14px;">';

    // Profile card
    html += '<div style="background:#f8fafc;border-radius:14px;padding:16px;border:1px solid #e2e8f0;">';
    html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">';
    html += photoURL ? '<img src="'+photoURL+'" style="width:52px;height:52px;border-radius:14px;object-fit:cover;flex-shrink:0;">'
            : '<div style="width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#2563eb,#7c3aed);display:flex;align-items:center;justify-content:center;color:white;font-size:22px;font-weight:800;flex-shrink:0;">'+displayName.charAt(0).toUpperCase()+'</div>';
    html += '<div style="flex:1;min-width:0;">';
    html += '<div style="font-weight:800;font-size:15px;color:#0f172a;">'+displayName+'</div>';
    if(email) html += '<div style="font-size:12px;color:#2563eb;margin-top:1px;">✉️ '+email+'</div>';
    if(phone) html += '<div style="font-size:12px;color:#64748b;">📞 '+phone+'</div>';
    html += '<div style="display:flex;align-items:center;gap:6px;margin-top:4px;">';
    html += '<span style="font-size:10px;color:#94a3b8;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;">🆔 '+uidDisplay+'</span>';
    html += '<button onclick="bzCopyText(\''+uidDisplay+'\')" style="background:#eff6ff;border:none;color:#2563eb;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:10px;font-weight:700;flex-shrink:0;">📋 Copy ID</button>';
    html += '</div></div></div>';

    // Stats
    html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center;">';
    html += '<div style="background:white;border-radius:8px;padding:10px;border:1px solid #e2e8f0;"><div style="font-size:1.2rem;font-weight:800;color:#2563eb;">'+prods.length+'</div><div style="font-size:10px;color:#64748b;font-weight:600;">Products</div></div>';
    html += '<div style="background:white;border-radius:8px;padding:10px;border:1px solid #e2e8f0;"><div style="font-size:1.2rem;font-weight:800;color:#16a34a;">'+totalSales+'</div><div style="font-size:10px;color:#64748b;font-weight:600;">Total Sales</div></div>';
    html += '<div style="background:white;border-radius:8px;padding:10px;border:1px solid #e2e8f0;"><div style="font-size:1.2rem;font-weight:800;color:#7c3aed;">'+brands.length+'</div><div style="font-size:10px;color:#64748b;font-weight:600;">Brands</div></div>';
    html += '</div></div>'; // close profile card

    // Seller Request info if available
    if(sellerReqData && Object.keys(sellerReqData).length){
      html += '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:14px;">';
      html += '<div style="font-weight:700;font-size:13px;color:#15803d;margin-bottom:10px;"><i class="fas fa-user-check"></i> Seller Application Info</div>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;color:#374151;">';
      if(sr.shopName||sr.businessName) html += '<div>🏪 <strong>Shop:</strong> '+(sr.shopName||sr.businessName)+'</div>';
      if(sr.category) html += '<div>📦 <strong>Category:</strong> '+sr.category+'</div>';
      if(sr.gst) html += '<div>📋 <strong>GST:</strong> '+sr.gst+'</div>';
      if(sr.bankName) html += '<div>🏦 <strong>Bank:</strong> '+sr.bankName+'</div>';
      if(sr.accountNumber) html += '<div>💳 <strong>A/C:</strong> '+sr.accountNumber+'</div>';
      if(sr.ifsc) html += '<div>🔑 <strong>IFSC:</strong> '+sr.ifsc+'</div>';
      if(sr.status) html += '<div>📌 <strong>Status:</strong> '+sr.status+'</div>';
      if(sr.about||sr.description) html += '<div style="grid-column:1/-1;">📝 '+(sr.about||sr.description)+'</div>';
      html += '</div></div>';
    }

    // Brands
    if(brands.length){
      html += '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:14px;">';
      html += '<div style="font-weight:700;font-size:13px;color:#1d4ed8;margin-bottom:10px;"><i class="fas fa-award"></i> Brands ('+brands.length+')</div>';
      html += brands.map(function(b){
        return '<div style="display:flex;align-items:center;gap:10px;background:white;border-radius:8px;padding:10px 12px;margin-bottom:6px;">'
          +(b.logo?'<img src="'+b.logo+'" style="width:32px;height:32px;border-radius:8px;object-fit:cover;">'
            :'<div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#2563eb,#7c3aed);display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:13px;">'+(b.name||'B').charAt(0).toUpperCase()+'</div>')
          +'<div style="flex:1;"><div style="font-weight:700;font-size:13px;color:#0f172a;">'+(b.name||'Brand')
          +(b.blueTickAdmin?'<span style="color:#2563eb;margin-left:4px;">✓</span>':'')+'</div>'
          +(b.category?'<div style="font-size:11px;color:#64748b;">'+b.category+'</div>':'')
          +'<div style="font-size:10px;color:#94a3b8;margin-top:2px;">Status: '+(b.status||'active')+'</div></div>'
          +'</div>';
      }).join('');
      html += '</div>';
    }

    // Products
    if(prods.length){
      html += '<div>';
      html += '<div style="font-weight:700;font-size:13px;color:#374151;margin-bottom:10px;">📦 Products ('+prods.length+')</div>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
      window._lookupProducts = {};
      prods.forEach(function(p){ window._lookupProducts[p._id]=p; });
      html += prods.slice(0,8).map(function(p){
        var img=p.image||(p.images&&p.images[0])||'';
        var safeId=p._id.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        return '<div onclick="openLookupProduct(\''+safeId+'\')" style="background:white;border:1.5px solid #e2e8f0;border-radius:10px;overflow:hidden;cursor:pointer;transition:all .2s;" onmouseover="this.style.borderColor=\'#2563eb\';this.style.boxShadow=\'0 4px 12px rgba(37,99,235,.15)\'" onmouseout="this.style.borderColor=\'#e2e8f0\';this.style.boxShadow=\'none\'">'
          +(img?'<img src="'+img+'" style="width:100%;height:80px;object-fit:cover;">'
            :'<div style="width:100%;height:60px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:24px;">📦</div>')
          +'<div style="padding:8px 10px;">'
          +'<div style="font-size:12px;font-weight:700;color:#0f172a;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">'+(p.name||p.title||'Product')+'</div>'
          +'<div style="font-size:12px;color:#2563eb;font-weight:700;">₹'+(p.price||0)+'</div>'
          +'</div></div>';
      }).join('');
      html += '</div>';
      if(prods.length>8) html += '<p style="font-size:12px;color:#94a3b8;text-align:center;margin-top:8px;">...and '+(prods.length-8)+' more products</p>';
      html += '</div>';
    }

    if(!prods.length && !brands.length && !sellerReqData){
      html += '<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px;font-size:13px;color:#92400e;"><i class="fas fa-info-circle"></i> Seller found but no products or brands yet.</div>';
    }

    html += '</div>';
    res.innerHTML = html;

  }catch(e){
    res.innerHTML='<div style="text-align:center;padding:30px;"><i class="fas fa-exclamation-triangle" style="font-size:36px;color:#f97316;display:block;margin-bottom:12px;"></i><p style="color:#ef4444;font-weight:600;">Error: '+e.message+'</p><p style="color:#94a3b8;font-size:12px;margin-top:8px;">Check Firebase rules allow reading users/sellerRequests</p></div>';
  }
}


async function runSellerLookupWithParams(sid, uid) {
  try {
    // Get products by sellerId (both the input AND found uid)
    var searchIds = [sid];
    if(uid && uid!==sid) searchIds.push(uid);

    var prods=[], seen={};
    for(var i=0;i<searchIds.length;i++){
      var sid2=searchIds[i];
      var [p1,p2]=await Promise.all([
        database.ref('products').orderByChild('sellerId').equalTo(sid2).once('value').catch(()=>null),
        database.ref('sellerProducts/'+sid2).once('value').catch(()=>null)
      ]);
      if(p1&&p1.exists()) p1.forEach(function(c){if(!seen[c.key]){var d=c.val();d._id=c.key;prods.push(d);seen[c.key]=1;}});
      if(p2&&p2.exists()) p2.forEach(function(c){if(!seen[c.key]){var d=c.val();d._id=c.key;prods.push(d);seen[c.key]=1;}});
    }

    // Get brands - search by all possible owner fields
    var brands=[], bseen={};
    for(var j=0;j<searchIds.length;j++){
      var bid=searchIds[j];
      var bSnaps=await Promise.all([
        database.ref('brands').orderByChild('createdBy').equalTo(bid).once('value').catch(()=>null),
        database.ref('brands').orderByChild('uid').equalTo(bid).once('value').catch(()=>null),
        database.ref('brands').orderByChild('userId').equalTo(bid).once('value').catch(()=>null),
        database.ref('brands').orderByChild('sellerId').equalTo(bid).once('value').catch(()=>null)
      ]);
      bSnaps.forEach(function(bs){
        if(bs&&bs.exists()) bs.forEach(function(c){if(!bseen[c.key]){var d=c.val();d._id=c.key;brands.push(d);bseen[c.key]=1;}});
      });
    }
    // Also check user's own brandId field
    if(u && u.brandId && !bseen[u.brandId]){
      var ubSnap=await database.ref('brands/'+u.brandId).once('value').catch(()=>null);
      if(ubSnap&&ubSnap.exists()){var bd=ubSnap.val();bd._id=u.brandId;brands.push(bd);}
    }

    if(!u&&!prods.length&&!brands.length){
      res.innerHTML='<div style="text-align:center;padding:30px;"><i class="fas fa-user-slash" style="font-size:36px;color:#cbd5e1;display:block;margin-bottom:12px;"></i><p style="color:#64748b;">No seller found with this ID or Gmail:<br><strong>'+sid+'</strong></p></div>';
      return;
    }

    var totalSales=prods.reduce(function(s,p){return s+(parseInt(p.sales)||0);},0);
    var uidDisplay=uid||sid;

    res.innerHTML='<div style="display:flex;flex-direction:column;gap:14px;">'

      // Profile card
      +'<div style="background:#f8fafc;border-radius:12px;padding:16px;border:1px solid #e2e8f0;">'
      +'<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">'
      +(u&&u.photoURL?'<img src="'+u.photoURL+'" style="width:48px;height:48px;border-radius:12px;object-fit:cover;">'
        :'<div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#2563eb,#7c3aed);display:flex;align-items:center;justify-content:center;color:white;font-size:20px;font-weight:800;">'+(u&&(u.displayName||u.name)?((u.displayName||u.name).charAt(0).toUpperCase()):'S')+'</div>')
      +'<div style="flex:1;min-width:0;">'
      +'<div style="font-weight:800;font-size:15px;color:#0f172a;">'+(u&&(u.displayName||u.name)||'Unknown Seller')+'</div>'
      +'<div style="font-size:12px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+(u&&u.email||sid)+'</div>'
      +'<div style="display:flex;align-items:center;gap:6px;margin-top:4px;"><span style="font-size:11px;color:#94a3b8;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;">'+uidDisplay+'</span>'
      +'<button onclick="navigator.clipboard&&navigator.clipboard.writeText(\''+uidDisplay+'\').then(function(){showAdminToast(\'Seller ID copied!\',\'success\');})" style="background:#eff6ff;border:none;color:#2563eb;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:10px;font-weight:700;">Copy ID</button>'
      +'</div></div></div>'
      +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center;">'
      +'<div style="background:white;border-radius:8px;padding:10px;border:1px solid #e2e8f0;"><div style="font-size:1.1rem;font-weight:800;color:#2563eb;">'+prods.length+'</div><div style="font-size:10px;color:#64748b;">Products</div></div>'
      +'<div style="background:white;border-radius:8px;padding:10px;border:1px solid #e2e8f0;"><div style="font-size:1.1rem;font-weight:800;color:#16a34a;">'+totalSales+'</div><div style="font-size:10px;color:#64748b;">Total Sales</div></div>'
      +'<div style="background:white;border-radius:8px;padding:10px;border:1px solid #e2e8f0;"><div style="font-size:1.1rem;font-weight:800;color:#7c3aed;">'+brands.length+'</div><div style="font-size:10px;color:#64748b;">Brands</div></div>'
      +'</div></div>'

      // Brands
      +(brands.length
        ?'<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:14px;">'
         +'<div style="font-weight:700;font-size:13px;color:#1d4ed8;margin-bottom:10px;"><i class="fas fa-award"></i> Brand(s) ('+brands.length+')</div>'
         +brands.map(function(b){return '<div style="display:flex;align-items:center;gap:10px;background:white;border-radius:8px;padding:10px 12px;margin-bottom:6px;">'
           +(b.logo?'<img src="'+b.logo+'" style="width:32px;height:32px;border-radius:8px;object-fit:cover;">'
             :'<div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#2563eb,#7c3aed);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;">'+b.name.charAt(0).toUpperCase()+'</div>')
           +'<div style="flex:1;"><div style="font-weight:700;font-size:13px;color:#0f172a;">'+(b.name||'Brand')+(b.blueTickAdmin?' <span style="color:#2563eb;">✓</span>':'')+'</div>'
           +'<div style="font-size:11px;color:#64748b;">'+(b.category||'')+(b.status==='suspended'?' · <span style="color:#ef4444;">Suspended</span>':'')+'</div></div>'
           +'</div>';}).join('')
         +'</div>'
        :'<div style="background:#fff7f7;border:1px solid #fca5a5;border-radius:12px;padding:14px;"><div style="font-size:13px;color:#dc2626;font-weight:600;"><i class="fas fa-info-circle"></i> No brands found for this seller</div></div>')

      // Products
      +(prods.length
        ?'<div><div style="font-weight:700;font-size:13px;color:#374151;margin-bottom:10px;">📦 Products ('+prods.length+')</div>'
         +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
         +prods.slice(0,8).map(function(p){
           var img=p.image||(p.images&&p.images[0])||'';
           var safeId=p._id.replace(/'/g,"\\'");
           var safeName=(p.name||p.title||'Product').replace(/'/g,"\\'").replace(/"/g,'&quot;');
           var safePrice=p.price||0;
           return '<div onclick="openLookupProduct(\''+safeId+'\')" style="background:white;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;cursor:pointer;transition:all .2s;" onmouseover="this.style.borderColor=\'#2563eb\';this.style.boxShadow=\'0 4px 12px rgba(37,99,235,.15)\'" onmouseout="this.style.borderColor=\'#e2e8f0\';this.style.boxShadow=\'none\'">'
             +(img?'<img src="'+img+'" style="width:100%;height:80px;object-fit:cover;">'
               :'<div style="width:100%;height:60px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:22px;">📦</div>')
             +'<div style="padding:8px;"><div style="font-size:12px;font-weight:700;color:#0f172a;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">'+p.name+(p.title&&p.name!==p.title?' / '+p.title:'')+'</div>'
             +'<div style="font-size:11px;color:#2563eb;font-weight:700;">₹'+(p.price||0)+'</div></div></div>';
         }).join('')
         +'</div>'
         +(prods.length>8?'<p style="font-size:12px;color:#94a3b8;text-align:center;margin-top:8px;">...and '+(prods.length-8)+' more products</p>':'')
         +'</div>'
        :'')
      +'</div>';

    // Store products for click handler
    window._lookupProducts = {};
    prods.forEach(function(p){ window._lookupProducts[p._id]=p; });

  }catch(e){res.innerHTML='<p style="color:#ef4444;text-align:center;padding:20px;">Error: '+e.message+'</p>';}
}

function openLookupProduct(productId) {
  var p = window._lookupProducts && window._lookupProducts[productId];
  if (!p) { showAdminToast && showAdminToast('Product data not loaded', 'error'); return; }
  var img = p.image||(p.images&&p.images[0])||'';

  // Remove old if exists
  var old = document.getElementById('lookupProductModal');
  if (old) old.remove();

  var m = document.createElement('div');
  m.id = 'lookupProductModal';
  m.className = 'modal active';
  m.style.zIndex = '10003';

  var name = p.name || p.title || '';
  var price = p.price || 0;
  var stock = p.stock || '';
  var category = p.category || '';
  var desc = p.desc || p.description || '';

  m.innerHTML =
    '<div class="modal-content" style="max-width:520px;border-radius:16px;overflow:hidden;">'
    +'<div class="modal-header" style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:16px 20px;border:none;">'
    +'<h3 style="color:white;margin:0;font-size:15px;font-weight:700;">📦 Product Details</h3>'
    +'<button onclick="document.getElementById(\'lookupProductModal\').remove()" style="background:none;border:none;color:rgba(255,255,255,.8);font-size:22px;cursor:pointer;line-height:1;">&times;</button>'
    +'</div>'
    +'<div id="lookupProdView" style="padding:0;">'
    +(img?'<img src="'+img+'" style="width:100%;max-height:200px;object-fit:cover;">':'')
    +'<div style="padding:18px;">'
    +'<h3 style="margin:0 0 8px;font-size:1.05rem;color:#0f172a;font-weight:800;">'+name+'</h3>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">'
    +'<span style="background:#dbeafe;color:#1d4ed8;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;">₹'+price+'</span>'
    +(category?'<span style="background:#f1f5f9;color:#374151;padding:3px 10px;border-radius:20px;font-size:12px;">'+category+'</span>':'')
    +(stock?'<span style="background:#dcfce7;color:#15803d;padding:3px 10px;border-radius:20px;font-size:12px;">Stock: '+stock+'</span>':'')
    +'</div>'
    +(desc?'<p style="font-size:13px;color:#64748b;line-height:1.6;margin-bottom:14px;">'+desc+'</p>':'')
    +'<div style="font-size:10px;color:#94a3b8;font-family:monospace;margin-bottom:16px;">ID: '+productId+'</div>'
    +'<div style="display:flex;gap:10px;">'
    +'<button onclick="showLookupEditForm(\''+productId+'\')" style="flex:1;background:linear-gradient(135deg,#2563eb,#7c3aed);color:white;border:none;border-radius:10px;padding:11px;cursor:pointer;font-weight:700;font-size:13px;"><i class="fas fa-edit"></i> Edit</button>'
    +'<button onclick="confirmLookupDelete(\''+productId+'\')" style="flex:1;background:linear-gradient(135deg,#dc2626,#f97316);color:white;border:none;border-radius:10px;padding:11px;cursor:pointer;font-weight:700;font-size:13px;" id="lpDelBtn"><i class="fas fa-trash"></i> Delete</button>'
    +'</div></div></div>'
    // Edit form (hidden by default)
    +'<div id="lookupProdEdit" style="display:none;padding:18px;">'
    +'<div style="font-weight:800;font-size:14px;color:#0f172a;margin-bottom:14px;">✏️ Edit Product</div>'
    +'<div class="form-group" style="margin-bottom:12px;"><label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">Product Name *</label>'
    +'<input type="text" id="lpe_name" class="form-control" value="'+name.replace(/"/g,'&quot;')+'" style="border-radius:8px;padding:9px 12px;font-size:13px;"></div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">'
    +'<div class="form-group" style="margin:0;"><label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">Price (₹) *</label>'
    +'<input type="number" id="lpe_price" class="form-control" value="'+price+'" style="border-radius:8px;padding:9px 12px;font-size:13px;"></div>'
    +'<div class="form-group" style="margin:0;"><label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">Stock</label>'
    +'<input type="number" id="lpe_stock" class="form-control" value="'+stock+'" style="border-radius:8px;padding:9px 12px;font-size:13px;"></div>'
    +'</div>'
    +'<div class="form-group" style="margin-bottom:12px;"><label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">Category</label>'
    +'<input type="text" id="lpe_category" class="form-control" value="'+category.replace(/"/g,'&quot;')+'" style="border-radius:8px;padding:9px 12px;font-size:13px;"></div>'
    +'<div class="form-group" style="margin-bottom:16px;"><label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">Description</label>'
    +'<textarea id="lpe_desc" class="form-control" rows="3" style="border-radius:8px;padding:9px 12px;font-size:13px;resize:vertical;">'+desc+'</textarea></div>'
    +'<div style="display:flex;gap:10px;">'
    +'<button onclick="document.getElementById(\'lookupProdView\').style.display=\'\';document.getElementById(\'lookupProdEdit\').style.display=\'none\';" style="flex:1;background:#f1f5f9;color:#64748b;border:none;border-radius:10px;padding:11px;cursor:pointer;font-weight:600;font-size:13px;">Cancel</button>'
    +'<button onclick="saveLookupEdit(\''+productId+'\')" id="lpe_saveBtn" style="flex:2;background:linear-gradient(135deg,#2563eb,#7c3aed);color:white;border:none;border-radius:10px;padding:11px;cursor:pointer;font-weight:700;font-size:13px;"><i class="fas fa-save"></i> Save Changes</button>'
    +'</div></div>'
    +'</div>';

  document.body.appendChild(m);
}

function showLookupEditForm(productId) {
  var view = document.getElementById('lookupProdView');
  var edit = document.getElementById('lookupProdEdit');
  if (view) view.style.display = 'none';
  if (edit) edit.style.display = 'block';
}

function saveLookupEdit(productId) {
  var name = (document.getElementById('lpe_name').value || '').trim();
  var price = parseFloat(document.getElementById('lpe_price').value) || 0;
  var stock = parseInt(document.getElementById('lpe_stock').value) || 0;
  var category = (document.getElementById('lpe_category').value || '').trim();
  var desc = (document.getElementById('lpe_desc').value || '').trim();

  if (!name) { showAdminToast && showAdminToast('Product name required', 'error'); return; }

  var btn = document.getElementById('lpe_saveBtn');
  if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; btn.disabled = true; }

  var updates = { title: name, name: name, price: price, stock: stock, category: category, desc: desc, description: desc, updatedAt: Date.now() };

  database.ref('products/' + productId).update(updates)
    .then(function() {
      // Update local cache
      if (window._lookupProducts && window._lookupProducts[productId]) {
        Object.assign(window._lookupProducts[productId], updates);
      }
      showAdminToast && showAdminToast('✅ Product updated!', 'success');
      document.getElementById('lookupProductModal') && document.getElementById('lookupProductModal').remove();
      // Also try to update sellerProducts if exists
      var p = window._lookupProducts && window._lookupProducts[productId];
      if (p && p.sellerId) {
        database.ref('sellerProducts/' + p.sellerId + '/' + productId).update(updates).catch(function(){});
      }
    })
    .catch(function(e) {
      showAdminToast && showAdminToast('Error: ' + e.message, 'error');
      if (btn) { btn.innerHTML = '<i class="fas fa-save"></i> Save Changes'; btn.disabled = false; }
    });
}

function confirmLookupDelete(productId) {
  var p = window._lookupProducts && window._lookupProducts[productId];
  var name = p ? (p.name || p.title || 'this product') : 'this product';

  if (!confirm('Delete "' + name + '"?\n\nThis action CANNOT be undone. The product will be permanently removed.')) return;

  var btn = document.getElementById('lpDelBtn');
  if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...'; btn.disabled = true; }

  var deletePromises = [database.ref('products/' + productId).remove()];

  // Also delete from sellerProducts if we know the seller
  if (p && p.sellerId) {
    deletePromises.push(database.ref('sellerProducts/' + p.sellerId + '/' + productId).remove().catch(function(){}));
  }

  Promise.all(deletePromises)
    .then(function() {
      showAdminToast && showAdminToast('🗑️ Product deleted successfully!', 'success');
      document.getElementById('lookupProductModal') && document.getElementById('lookupProductModal').remove();
      if (window._lookupProducts) delete window._lookupProducts[productId];
      // Remove card from lookup results UI
      var card = document.querySelector('[onclick*="openLookupProduct(\'' + productId + '\')"]');
      if (card) { card.style.opacity = '0'; card.style.transition = 'opacity 0.3s'; setTimeout(function(){ card.remove(); }, 300); }
    })
    .catch(function(e) {
      showAdminToast && showAdminToast('Error: ' + e.message, 'error');
      if (btn) { btn.innerHTML = '<i class="fas fa-trash"></i> Delete'; btn.disabled = false; }
    });
}

// Keep these as aliases for compatibility
function editProductFromLookup(productId) { showLookupEditForm(productId); }
function deleteProductFromLookup(productId) { confirmLookupDelete(productId); }

// Admin Brand Page
var _currentAdminBrandId=null, _adminBrandData=null;
function openAdminBrandPage(brandId,brandData){
  _currentAdminBrandId=brandId; _adminBrandData=brandData;
  document.getElementById('adminBrandPage').style.display='block';
  document.body.style.overflow='hidden';
  document.getElementById('abpTitle').textContent=brandData.name||'My Brand';
  document.getElementById('abpBrandName').textContent=brandData.name||'Brand';
  document.getElementById('abpBrandCat').textContent=brandData.category||'';
  var av=document.getElementById('abpAvatar');
  av.innerHTML=brandData.logo?'<img src="'+brandData.logo+'" style="width:100%;height:100%;border-radius:17px;object-fit:cover;">':(brandData.name||'B').charAt(0).toUpperCase();
  document.getElementById('abpProductToggle').checked=brandData.showProducts!==false;
  document.getElementById('abpPostToggle').checked=brandData.showPosts===true;
  updateAbpVisibility(); loadAbpData();
}
function closeAdminBrandPage(){document.getElementById('adminBrandPage').style.display='none';document.body.style.overflow='';}
function editAdminBrand(){showAdminToast&&showAdminToast('Edit brand coming soon','info');}
function updateAbpVisibility(){
  var sp=document.getElementById('abpProductToggle').checked;
  var ss=document.getElementById('abpPostToggle').checked;
  document.getElementById('abpProductsSection').style.display=sp?'block':'none';
  document.getElementById('abpPostsSection').style.display=ss?'block':'none';
  document.getElementById('abpAddProductBtn').style.display=sp?'flex':'none';
  document.getElementById('abpAddPostBtn').style.display=ss?'flex':'none';
}
function saveAdminBrandToggles(){
  updateAbpVisibility();
  if(!_currentAdminBrandId) return;
  database.ref('brands/'+_currentAdminBrandId).update({showProducts:document.getElementById('abpProductToggle').checked,showPosts:document.getElementById('abpPostToggle').checked});
}
async function loadAbpData(){
  if(!_currentAdminBrandId) return;
  try{
    var [pSnap,postSnap,fSnap]=await Promise.all([
      database.ref('products').orderByChild('brandId').equalTo(_currentAdminBrandId).once('value'),
      database.ref('brandPosts/'+_currentAdminBrandId).once('value'),
      database.ref('brandFollowers').orderByChild('brandId').equalTo(_currentAdminBrandId).once('value')
    ]);
    var prods=[]; if(pSnap.exists())pSnap.forEach(function(c){var p=c.val();p._id=c.key;prods.push(p);});
    document.getElementById('abpProdCount').textContent=prods.length;
    document.getElementById('abpProdCountLabel').textContent=prods.length+' products';
    document.getElementById('abpProductsList').innerHTML=prods.length?prods.map(function(p){var img=p.image||(p.images&&p.images[0])||'';return '<div style="background:white;border:1.5px solid #e2e8f0;border-radius:12px;overflow:hidden;"><div style="height:100px;background:#f1f5f9;overflow:hidden;">'+(img?'<img src="'+img+'" style="width:100%;height:100%;object-fit:cover;">'+'':'<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:28px;">📦</div>')+'</div><div style="padding:10px;"><div style="font-weight:700;font-size:13px;color:#0f172a;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">'+(p.name||p.title||'Product')+'</div><div style="font-size:12px;color:#2563eb;font-weight:700;">₹'+(p.price||0)+'</div></div></div>';}).join(''):'<p style="color:#94a3b8;text-align:center;padding:20px;grid-column:span 2;">No products yet</p>';
    var posts=[]; if(postSnap.exists())postSnap.forEach(function(c){var p=c.val();p._id=c.key;posts.unshift(p);});
    document.getElementById('abpPostCount').textContent=posts.length;
    document.getElementById('abpPostsList').innerHTML=posts.length?posts.map(function(p){return '<div style="background:white;border-radius:14px;padding:16px;margin-bottom:14px;box-shadow:0 2px 8px rgba(0,0,0,.06);border:1px solid #e2e8f0;"><div style="font-weight:700;font-size:15px;color:#0f172a;margin-bottom:6px;">'+(p.title||'Post')+'</div>'+(p.image?'<img src="'+p.image+'" style="width:100%;border-radius:10px;max-height:200px;object-fit:cover;margin-bottom:8px;">':'')+'<p style="font-size:13px;color:#374151;line-height:1.6;margin:0;">'+(p.content||'')+'</p><div style="font-size:11px;color:#94a3b8;margin-top:8px;">'+new Date(p.createdAt).toLocaleString('en-IN')+'</div></div>';}).join(''):'<p style="color:#94a3b8;text-align:center;padding:20px;">No posts yet</p>';
    var f=0; if(fSnap.exists())fSnap.forEach(function(){f++;});
    document.getElementById('abpFollowers').textContent=f;
  }catch(e){console.error(e);}
}
function showAddAdminProductForm(){closeAdminBrandPage();if(typeof showTab==='function')showTab('products');}

// Brand Followers Modal
async function showBrandFollowers(brandId,brandName){
  var m=document.createElement('div'); m.className='modal active'; m.style.zIndex='10001';
  m.innerHTML='<div class="modal-content" style="max-width:460px;border-radius:16px;overflow:hidden;"><div class="modal-header" style="background:linear-gradient(135deg,#2563eb,#7c3aed);padding:18px 22px;border:none;"><h3 style="color:white;margin:0;font-size:15px;font-weight:700;"><i class="fas fa-users"></i> Followers — '+(brandName||'Brand')+'</h3><button onclick="this.closest(\'.modal\').remove()" style="background:none;border:none;color:white;font-size:22px;cursor:pointer;">&times;</button></div><div class="modal-body" style="padding:20px;max-height:380px;overflow-y:auto;" id="bFollowerList"><p style="text-align:center;color:#94a3b8;"><i class="fas fa-spinner fa-spin"></i></p></div></div>';
  document.body.appendChild(m);
  try{
    var snap=await database.ref('brandFollowers').orderByChild('brandId').equalTo(brandId).once('value');
    var list=[]; if(snap.exists())snap.forEach(function(c){var d=c.val();if(d){d._k=c.key;list.push(d);}});
    list.sort(function(a,b){return (b.followedAt||0)-(a.followedAt||0);});
    var el=document.getElementById('bFollowerList');
    el.innerHTML=list.length?list.map(function(f){var dt=f.followedAt?new Date(f.followedAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'Unknown';return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f1f5f9;"><div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#2563eb,#7c3aed);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;flex-shrink:0;">'+(f.userName||'U').charAt(0).toUpperCase()+'</div><div style="flex:1;"><div style="font-weight:700;font-size:13px;color:#0f172a;">'+(f.userName||f.userId||'User')+'</div><div style="font-size:11px;color:#94a3b8;">Followed on '+dt+'</div></div></div>';}).join(''):'<div style="text-align:center;padding:30px;"><i class="fas fa-user-slash" style="font-size:36px;color:#cbd5e1;display:block;margin-bottom:12px;"></i><p style="color:#64748b;">No followers yet</p></div>';
  }catch(e){document.getElementById('bFollowerList').innerHTML='<p style="color:#ef4444;">Error: '+e.message+'</p>';}
}

// Add Seller Lookup to sidebar - SKIP (already in HTML menu)
// window._bzSellerLookupInjected = true;

function bzCopyText(text, btn) {
  if(!text || text==='undefined' || text==='null') {
    showAdminToast && showAdminToast('Nothing to copy', 'error');
    return;
  }
  var orig = btn ? (btn.textContent || btn.innerHTML) : '';
  function onSuccess() {
    showAdminToast && showAdminToast('✅ Copied!', 'success');
    if(btn) {
      btn.textContent = '✅ Copied!';
      setTimeout(function(){ if(btn) btn.innerHTML = orig; }, 2000);
    }
  }
  if(navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(onSuccess).catch(fallback);
  } else { fallback(); }
  function fallback() {
    var el = document.createElement('textarea');
    el.value = text;
    el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
    document.body.appendChild(el);
    el.focus(); el.select();
    try { document.execCommand('copy'); onSuccess(); }
    catch(e) { showAdminToast && showAdminToast('Copy failed — select manually', 'error'); }
    document.body.removeChild(el);
  }
}

// Alias for backward compatibility
function bzCopySellerID(uid, btn) { bzCopyText(uid, btn); }

// Add Brand / Save Admin Brand
function showAddAdminBrandModal(){
  ['adminBrandName','adminBrandLogo','adminBrandCategory'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  var bt=document.getElementById('adminBrandBlueTick'); if(bt) bt.checked=true;
  document.getElementById('addAdminBrandModal').classList.add('active');
}
function saveAdminBrand(){
  var name=document.getElementById('adminBrandName').value.trim();
  if(!name){showAdminToast&&showAdminToast('Brand name required','error');return;}
  var logo=document.getElementById('adminBrandLogo').value.trim();
  var cat=document.getElementById('adminBrandCategory').value.trim();
  var bt=document.getElementById('adminBrandBlueTick').checked;
  var bid='brand_admin_'+Date.now();
  database.ref('brands/'+bid).set({name,logo:logo||'',category:cat||'',blueTickAdmin:bt,isAdminBrand:true,status:'active',createdAt:Date.now(),createdBy:'admin',showProducts:true,showPosts:false})
    .then(function(){closeModal('addAdminBrandModal');showAdminToast&&showAdminToast('Brand added'+(bt?' with Blue Tick ✓':'')+'!','success');if(typeof loadBrandsPanel==='function')loadBrandsPanel();})
    .catch(function(e){showAdminToast&&showAdminToast('Error: '+e.message,'error');});
}
function suspendBrand(id){if(!confirm('Suspend this brand?'))return;database.ref('brands/'+id).update({status:'suspended'}).then(function(){showAdminToast&&showAdminToast('Brand suspended!','success');if(typeof loadBrandsPanel==='function')loadBrandsPanel();});}
function activateBrand(id){database.ref('brands/'+id).update({status:'active'}).then(function(){showAdminToast&&showAdminToast('Brand activated!','success');if(typeof loadBrandsPanel==='function')loadBrandsPanel();});}
function deleteBrand(id){if(!confirm('Delete this brand permanently?'))return;database.ref('brands/'+id).remove().then(function(){showAdminToast&&showAdminToast('Brand deleted!','success');if(typeof loadBrandsPanel==='function')loadBrandsPanel();});}
function toggleBlueTick(id,cur){var nv=!cur;database.ref('brands/'+id).update({blueTickAdmin:nv}).then(function(){showAdminToast&&showAdminToast(nv?'✅ Blue Tick added!':'Blue Tick removed','success');if(typeof loadBrandsPanel==='function')loadBrandsPanel();});}


/* ═══════════════════════════════════════════════════════ */


// ── POST MODAL (replaces prompt) ───────────────────
window.showAddAdminPostForm = function() {
  if (!window._currentAdminBrandId) return;
  var existing = document.getElementById('addPostModal');
  if (existing) { existing.classList.add('active'); return; }
  var m = document.createElement('div');
  m.className='modal'; m.id='addPostModal';
  m.innerHTML=`<div class="modal-content" style="max-width:500px;border-radius:16px;overflow:hidden;">
    <div class="modal-header" style="background:linear-gradient(135deg,#16a34a,#06b6d4);padding:18px 22px;border:none;">
      <h3 style="color:white;margin:0;font-size:15px;font-weight:700;"><i class="fas fa-edit"></i> Create Post</h3>
      <button class="close" onclick="document.getElementById('addPostModal').classList.remove('active')" style="color:rgba(255,255,255,.8);">&times;</button>
    </div>
    <div class="modal-body" style="padding:22px;">
      <div class="form-group"><label>Post Title *</label><input type="text" id="postModalTitle" class="form-control" placeholder="e.g. New Collection Launch!"></div>
      <div class="form-group"><label>Content</label><textarea id="postModalContent" class="form-control" rows="4" placeholder="Write your post..." style="resize:vertical;"></textarea></div>
      <div class="form-group"><label>Image URL (optional)</label><input type="url" id="postModalImage" class="form-control" placeholder="https://..."></div>
      <div style="display:flex;gap:10px;margin-top:4px;">
        <button onclick="document.getElementById('addPostModal').classList.remove('active')" style="flex:1;background:#f1f5f9;color:#64748b;border:none;border-radius:10px;padding:12px;cursor:pointer;font-weight:600;">Cancel</button>
        <button onclick="publishAdminPost()" style="flex:2;background:linear-gradient(135deg,#16a34a,#06b6d4);color:white;border:none;border-radius:10px;padding:12px;cursor:pointer;font-weight:700;"><i class="fas fa-paper-plane"></i> Publish</button>
      </div>
    </div></div>`;
  document.body.appendChild(m);
  m.classList.add('active');
};

window.publishAdminPost = async function() {
  var title=document.getElementById('postModalTitle').value.trim();
  var content=document.getElementById('postModalContent').value.trim();
  var image=document.getElementById('postModalImage').value.trim();
  if (!title){ showAdminToast && showAdminToast('Title required','error'); return; }
  var pid='post_'+Date.now();
  await database.ref('brandPosts/'+window._currentAdminBrandId+'/'+pid)
    .set({title,content,image:image||'',createdAt:Date.now(),brandId:window._currentAdminBrandId});
  document.getElementById('addPostModal').classList.remove('active');
  ['postModalTitle','postModalContent','postModalImage'].forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
  showAdminToast && showAdminToast('Post published!','success');
  if(typeof loadAbpData==='function') loadAbpData();
};

// ── SIDEBAR LIVE BADGES ────────────────────────────
(function sidebarBadges(){
  function ready(){
    if(typeof database==='undefined'){setTimeout(ready,700);return;}
    function setBadge(tab,n){
      var el=document.querySelector('.menu-item[data-tab="'+tab+'"]');
      if(!el) return;
      var b=el.querySelector('.sidebar-badge');
      if(n<=0){if(b)b.remove();return;}
      if(!b){b=document.createElement('span');b.className='sidebar-badge';el.appendChild(b);}
      b.textContent=n>99?'99+':n;
    }
    database.ref('sellerRequests').on('value',function(s){
      var c=0;if(s.exists())s.forEach(function(ch){var d=ch.val();if(d&&(d.status==='pending'||!d.status)&&!(_readSellerReq||{})[ch.key])c++;});
      setBadge('seller-requests',c);
    });
    database.ref('brandRequests').orderByChild('status').equalTo('pending').on('value',function(s){
      var c=0;if(s.exists())s.forEach(function(ch){if(!(_readBrandReq||{})[ch.key])c++;});
      setBadge('brand-requests',c);
    });
    database.ref('orders').orderByChild('createdAt').limitToLast(30).on('value',function(s){
      var c=0;if(s.exists())s.forEach(function(ch){var d=ch.val();if(d&&!(_readOrders||{})[ch.key]&&(Date.now()-(d.createdAt||0))<259200000)c++;});
      setBadge('orders',c);
    });
    // Pending seller count fix
    database.ref('sellerRequests').on('value',function(s){
      var c=0;if(s.exists())s.forEach(function(ch){var d=ch.val();if(d&&(d.status==='pending'||!d.status))c++;});
      // Fix: use correct element ID 'pendingSellerReqs'
      var el=document.getElementById('pendingSellerReqs');
      if(el) el.textContent=c;
    });
  }
  ready();
})();

// ── MOBILE MENU BUTTON ─────────────────────────────
(function(){
  function inject(){
    var h=document.querySelector('.admin-header,#adminHeader');
    if(!h){setTimeout(inject,600);return;}
    if(document.getElementById('bzMobileBtn')) return;
    var btn=document.createElement('button');
    btn.id='bzMobileBtn';
    btn.style.cssText='display:none;background:none;border:1.5px solid #e2e8f0;border-radius:10px;width:38px;height:38px;cursor:pointer;font-size:16px;align-items:center;justify-content:center;color:#374151;flex-shrink:0;';
    btn.innerHTML='<i class="fas fa-bars"></i>';
    btn.onclick=function(){ if(typeof toggleSidebar==='function') toggleSidebar(); };
    h.prepend(btn);
    function check(){btn.style.display=window.innerWidth<768?'flex':'none';}
    check(); window.addEventListener('resize',check);
  }
  inject();
})();

console.log('✅ Buyzo Admin Design Patch Part 2 loaded');
