
    // Update contact name
    async function editContactName(contactId) {
      const contact = contactsMap[contactId];
      if (!contact) return;
      
      const newName = prompt('Enter contact name:', contact.name || '');
      if (newName === null) return; // User cancelled
      
      try {
        const res = await apiRequest(`/api/contacts/${contactId}/name`, {
          method: 'POST',
          body: JSON.stringify({ name: newName })
        });
        
        contactsMap[contactId].name = res.name;
        selectThread(contactId);
        loadChatThreads(false);
        showToast('Contact name updated');
      } catch (err) {
        console.error('Failed to update contact name', err);
        showToast('Failed to update contact name', 'error');
      }
    }

    // Password visibility toggle helper
    function togglePasswordVisibility(inputId, toggleEl) {
      const input = document.getElementById(inputId);
      if (!input) return;
      
      if (input.type === 'password') {
        input.type = 'text';
        toggleEl.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" style="width: 1.1rem; height: 1.1rem;">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        `;
      } else {
        input.type = 'password';
        toggleEl.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" style="width: 1.1rem; height: 1.1rem;">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
          </svg>
        `;
      }
    }

    let workspaceId = '';
    let isTeamLeader = false;
    let socket = null;
    let activeContactId = null;
    let contactsMap = {};
    let transactionsList = [];
    let currentWorkspace = null;
    let trafficChart = null;
    let spendChart = null;
    let typingTimeout = null;

    const serverUrl = (window.location.protocol === 'http:' || window.location.protocol === 'https:') 
      ? window.location.origin 
      : 'http://localhost:3000';

    let metaConfigId = null;

    // Initialize Facebook SDK dynamically on page load
    async function initFacebookSDK() {
      try {
        const res = await fetch(`${serverUrl}/api/config`);
        const data = await res.json();
        if (data && data.metaAppId) {
          const metaAppId = data.metaAppId;
          metaConfigId = data.metaConfigId;

          // Define fbAsyncInit synchronously using the fetched data
          window.fbAsyncInit = function() {
            FB.init({
              appId            : metaAppId,
              cookie           : true,
              autoLogAppEvents : true,
              xfbml            : true,
              version          : 'v25.0'
            });
            FB.AppEvents.logPageView();
            console.log('✓ Meta Facebook SDK initialized successfully with App ID:', metaAppId);
            if (metaConfigId) {
              console.log('✓ Meta Configuration ID resolved:', metaConfigId);
            }
          };

          // Load the Facebook SDK asynchronously using dynamic IIFE injection
          (function(d, s, id){
             var js, fjs = d.getElementsByTagName(s)[0];
             if (d.getElementById(id)) {return;}
             js = d.createElement(s); js.id = id;
             js.src = "https://connect.facebook.net/en_US/sdk.js";
             fjs.parentNode.insertBefore(js, fjs);
           }(document, 'script', 'facebook-jssdk'));

        } else {
          console.warn('⚠️ Meta App ID is not configured on the server. Embedded Signup may not function.');
        }
      } catch (err) {
        console.error('Failed to load Meta App ID config for FB SDK:', err);
      }
    }

    // Initialize the SDK flow
    initFacebookSDK();

    // Page Elements
    const portalOverlay = document.getElementById('portal-overlay');
    const portalEnterBtn = document.getElementById('portal-enter-btn');

    const sidebarWallet = document.getElementById('sidebar-wallet-balance');
    const overviewWallet = document.getElementById('overview-wallet-balance');
    const activeWorkspacePill = document.getElementById('active-workspace-pill');
    
    // Status elements
    const socketDot = document.getElementById('socket-status-dot');
    const socketText = document.getElementById('socket-status-text');

    // Sidebar refill buttons
    const sidebarRefillBtn = document.getElementById('sidebar-refill-btn');
    const overviewRefillBtn = document.getElementById('overview-refill-btn');

    // Navigation and headers
    const menuItems = document.querySelectorAll('.menu-item');
    const viewPanes = document.querySelectorAll('.view-pane');
    const headerTitle = document.getElementById('header-view-title');
    const headerDesc = document.getElementById('header-view-desc');
    const logoutBtn = document.getElementById('logout-btn');

    // Tab Descriptors mapping
    const tabHeaders = {
      analytics: { title: '📊 Workspace Overview', desc: 'Monitor pipeline statistics and core KPIs in real-time.' },
      chat: { title: '💬 Shared Inbound Support Console', desc: 'Manage incoming customer replies and trigger text responses.' },
      campaigns: { title: '🚀 Marketing Broadcast Campaigns', desc: 'Enqueue bulk template campaigns and monitor background worker status.' },
      billing: { title: '💳 Credit Billing & Transaction Logs', desc: 'Monitor your workspace balance, view transaction ledger records, and print invoice receipts.' },
      settings: { title: '⚙️ WhatsApp API Settings', desc: 'Configure your Meta Cloud API connection credentials or onboard another business number.' }
    };

    // Sidebar toggle initialization
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    if (sidebarToggleBtn) {
      const collapsed = localStorage.getItem('sidebar-collapsed') === 'true';
      if (collapsed && window.innerWidth > 1024) {
        document.body.classList.add('sidebar-collapsed');
      }
      sidebarToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.innerWidth <= 1024) {
          const sidebar = document.querySelector('.app-sidebar');
          const backdrop = document.getElementById('sidebar-backdrop');
          if (sidebar) sidebar.classList.toggle('open');
          if (backdrop) backdrop.classList.toggle('active');
        } else {
          document.body.classList.toggle('sidebar-collapsed');
          localStorage.setItem('sidebar-collapsed', document.body.classList.contains('sidebar-collapsed'));
        }
      });
    }

    // Close sidebar on backdrop click (mobile)
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');
    if (sidebarBackdrop) {
      sidebarBackdrop.addEventListener('click', () => {
        const sidebar = document.querySelector('.app-sidebar');
        if (sidebar) sidebar.classList.remove('open');
        sidebarBackdrop.classList.remove('active');
      });
    }

    // Tab switcher logic
    menuItems.forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        
        // Update menu items
        menuItems.forEach(mi => mi.classList.remove('active'));
        item.classList.add('active');

        // Update view panes
        viewPanes.forEach(pane => pane.classList.remove('active'));
        document.getElementById(`pane-${tab}`).classList.add('active');

        // Update headers if they exist
        if (typeof headerTitle !== 'undefined' && headerTitle) {
          headerTitle.textContent = tabHeaders[tab].title;
        }
        if (typeof headerDesc !== 'undefined' && headerDesc) {
          headerDesc.textContent = tabHeaders[tab].desc;
        }

        // Close sidebar on mobile when switching tabs
        if (window.innerWidth <= 1024) {
          const sidebar = document.querySelector('.app-sidebar');
          if (sidebar) sidebar.classList.remove('open');
          if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
        }

        // Load tab data
        if (tab === 'analytics') loadOverviewData();
        if (tab === 'chat') loadChatData();
        if (tab === 'campaigns') loadCampaignsData();
        if (tab === 'billing') loadBillingData();
        if (tab === 'settings') loadSettingsData();
      });
    });

    // Mobile active chat back button listener
    const mobileChatBackBtn = document.getElementById('mobile-chat-back-btn');
    if (mobileChatBackBtn) {
      mobileChatBackBtn.addEventListener('click', () => {
        const chatView = document.querySelector('.chat-view');
        if (chatView) chatView.classList.remove('active-chat-open');
        activeContactId = null;
      });
    }

    // PORTAL GATEWAY INTERACTIONS (Sign In & Sign Up Logic)
    const portalTabSignIn = document.getElementById('portal-tab-signin');
    const portalTabSignUp = document.getElementById('portal-tab-signup');
    const portalPaneSignIn = document.getElementById('portal-pane-signin');
    const portalPaneSignUp = document.getElementById('portal-pane-signup');
    
    const portalSignUpBtn = document.getElementById('portal-signup-btn');
    const portalSignUpName = document.getElementById('portal-signup-name');
    const portalSignUpEmail = document.getElementById('portal-signup-email');
    const portalSignUpPassword = document.getElementById('portal-signup-password');
    
    const portalSignUpSuccess = document.getElementById('portal-signup-success');
    const portalNewIdBadge = document.getElementById('portal-new-id-badge');
    const portalCopyBtn = document.getElementById('portal-copy-btn');
    const portalGoBtn = document.getElementById('portal-go-btn');

    // 1. Tab Swapping
    portalTabSignIn.addEventListener('click', () => {
      portalTabSignIn.style.background = 'var(--primary)';
      portalTabSignIn.style.color = '#fff';
      portalTabSignIn.style.fontWeight = '600';
      portalTabSignUp.style.background = 'transparent';
      portalTabSignUp.style.color = '#var(--text-muted)';
      portalTabSignUp.style.fontWeight = '500';

      portalPaneSignIn.classList.add('active');
      portalPaneSignUp.classList.remove('active');
      portalSignUpSuccess.style.display = 'none';
    });

    portalTabSignUp.addEventListener('click', () => {
      portalTabSignUp.style.background = 'var(--primary)';
      portalTabSignUp.style.color = '#fff';
      portalTabSignUp.style.fontWeight = '600';
      portalTabSignIn.style.background = 'transparent';
      portalTabSignIn.style.color = '#var(--text-muted)';
      portalTabSignIn.style.fontWeight = '500';

      portalPaneSignUp.classList.add('active');
      portalPaneSignIn.classList.remove('active');
      portalSignUpSuccess.style.display = 'none';
    });

    // 2. Portal Sign In Action
    portalEnterBtn.addEventListener('click', async () => {
      const name = document.getElementById('portal-signin-name').value.trim();
      const password = document.getElementById('portal-signin-password').value.trim();

      if (!name) {
        alert('Please enter your Business Name!');
        return;
      }
      if (password.length < 6) {
        alert('Password must be at least 6 characters long!');
        return;
      }

      portalEnterBtn.disabled = true;
      portalEnterBtn.textContent = 'Authorizing...';

      try {
        const response = await fetch(`${serverUrl}/api/workspaces/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name, password })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to authorize session.');
        }

        workspaceId = data.token; // Split token `<workspaceId>:<role>` is used for Bearer auth headers
        isTeamLeader = data.isTeamLeader; // Global role state
        localStorage.setItem('workspaceToken', workspaceId); // PERSIST TOKEN
        portalOverlay.style.display = 'none';

        // Load initial workspace data and initialize Socket
        initializeWorkspace();
      } catch (err) {
        console.error('Login failure:', err);
        alert(`✗ Authentication failed: ${err.message}`);
      } finally {
        portalEnterBtn.disabled = false;
        portalEnterBtn.textContent = 'Authorize Session';
      }
    });

    // 3. Portal Sign Up (Create Account) Action
    portalSignUpBtn.addEventListener('click', async () => {
      const name = portalSignUpName.value.trim();
      const email = portalSignUpEmail.value.trim();
      const leaderPassword = document.getElementById('portal-signup-leader-pass').value.trim();
      const memberPassword = document.getElementById('portal-signup-member-pass').value.trim();

      if (!name) {
        alert('Please enter a business or workspace name!');
        return;
      }
      if (!email || !email.includes('@')) {
        alert('Please enter a valid administrator email!');
        return;
      }
      if (leaderPassword.length < 6 || memberPassword.length < 6) {
        alert('Passwords must be at least 6 characters!');
        return;
      }

      portalSignUpBtn.disabled = true;
      portalSignUpBtn.textContent = 'Registering Workspace...';

      try {
        const response = await fetch(`${serverUrl}/api/workspaces`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name, leaderPassword, memberPassword })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to create workspace account.');
        }

        // Display credentials success subcard
        portalPaneSignIn.style.display = 'none';
        portalPaneSignUp.style.display = 'none';
        document.querySelector('.portal-tabs').style.display = 'none';
        
        portalNewIdBadge.textContent = data.id;
        portalSignUpSuccess.style.display = 'block';
        
        // Save the workspace ID and default to leader access for the creator
        workspaceId = `${data.id}:leader`;
        isTeamLeader = true;
        localStorage.setItem('workspaceToken', workspaceId); // PERSIST TOKEN

      } catch (err) {
        alert(`Failed to create account: ${err.message}`);
        portalSignUpBtn.disabled = false;
        portalSignUpBtn.textContent = 'Create Workspace Account';
      }
    });

    // 4. Clipboard Copy
    portalCopyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(portalNewIdBadge.textContent)
        .then(() => {
          portalCopyBtn.textContent = '✓ Copied!';
          setTimeout(() => {
            portalCopyBtn.textContent = '📋 Copy';
          }, 2000);
        })
        .catch(err => {
          alert('Failed to copy. Please highlight the text to copy manually.');
        });
    });

    // 5. Enter Dashboard after Sign Up
    portalGoBtn.addEventListener('click', () => {
      portalOverlay.style.display = 'none';
      initializeWorkspace();
    });

    // 6. Logout restores original portal view layout
    if (typeof logoutBtn !== 'undefined' && logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('workspaceToken'); // CLEAR PERSISTED TOKEN
        if (socket) socket.disconnect();
        activeContactId = null;
        
        // Reset portal layouts
        portalPaneSignIn.style.display = 'block';
        portalPaneSignUp.style.display = 'none';
        document.querySelector('.portal-tabs').style.display = 'flex';
        portalSignUpSuccess.style.display = 'none';
        portalSignUpBtn.disabled = false;
        portalSignUpBtn.textContent = 'Create Workspace Account';
        portalSignUpName.value = '';
        
        // Default back to sign in tab selection
        portalTabSignIn.click();

        portalOverlay.style.display = 'flex';
        document.getElementById('chat-threads-list').innerHTML = '';
        resetChatArea();
      });
    }

    // 7. Auto login check if token is stored in localStorage
    const savedToken = localStorage.getItem('workspaceToken');
    if (savedToken) {
      workspaceId = savedToken;
      isTeamLeader = savedToken.includes(':') ? savedToken.split(':')[1] === 'leader' : true;
      portalOverlay.style.display = 'none';
      initializeWorkspace();
    }

    async function initializeWorkspace() {
      // Connect Socket.io
      connectSocket();
      
      // Fetch Workspace information
      const success = await loadOverviewData();
      if (!success) {
        // Fallback or warning
        console.warn('Workspace load failed. Verify server and ID.');
      }

      // Load dynamic team members
      await loadTeamMembers();

      // Sync UI role states
      syncAssigneeSelectState();
    }

    // Socket Connection Setup
    function connectSocket() {
      socketText.textContent = 'Connecting...';
      socketDot.className = 'status-dot';

      if (socket) socket.disconnect();

      socket = io(serverUrl);

      socket.on('connect', () => {
        socketText.textContent = 'Online';
        socketDot.className = 'status-dot active';

        // Join the unique workspace room (use clean workspaceId without the :role suffix)
        const cleanWorkspaceId = workspaceId.includes(':') ? workspaceId.split(':')[0] : workspaceId;
        socket.emit('joinWorkspace', cleanWorkspaceId);
      });

      socket.on('disconnect', () => {
        socketText.textContent = 'Offline';
        socketDot.className = 'status-dot';
      });

      socket.on('connect_error', () => {
        socketText.textContent = 'Err';
        socketDot.className = 'status-dot';
      });

      // Listen for incoming and outgoing messages
      socket.on('newMessage', (message) => {
        console.log('Real-Time Message Recv:', message);
        
        // 1. Refresh analytics if on Overview tab
        const activeTab = document.querySelector('.menu-item.active').getAttribute('data-tab');
        if (activeTab === 'analytics') {
          loadOverviewData();
        }

        // 2. If chat is active, update
        if (activeTab === 'chat') {
          // If the message belongs to the currently active contact thread, append it
          if (activeContactId === message.contactId) {
            appendChatBubble(message);
          }
          // Refresh thread list to show latest previews and update ordering
          loadChatThreads(false);
        }
      });

      // Listen for real-time Campaign status worker completions (Option E)
      socket.on('campaignUpdated', (campaign) => {
        console.log('Real-Time Campaign Completed:', campaign);
        
        // Refresh data dynamically
        const activeTab = document.querySelector('.menu-item.active').getAttribute('data-tab');
        if (activeTab === 'campaigns') {
          loadCampaignsData();
        }
        if (activeTab === 'analytics') {
          loadOverviewData();
        }
        
        // Refresh wallet balance display
        loadOverviewData();
      });

      // Listen for ticket assignment updates from other agents (Option F)
      socket.on('contactAssigned', ({ contactId, agentName }) => {
        console.log('Real-Time Contact Assigned:', contactId, agentName);
        if (contactsMap[contactId]) {
          contactsMap[contactId].assignedAgent = agentName;
        }
        const activeAssigneeSelect = document.getElementById('chat-assignee-select');
        if (activeContactId === contactId && activeAssigneeSelect) {
          activeAssigneeSelect.value = agentName || 'Unassigned';
        }
        loadChatThreads(false);
      });

      // Listen for real-time outbound status checkmark updates (Option B)
      socket.on('messageStatusUpdated', ({ messageId, contactId, status }) => {
        console.log('Real-Time Status Recv:', messageId, status);
        const span = document.getElementById(`status-span-${messageId}`);
        if (span) {
          const replacementHTML = getStatusCheckmarkHTML(messageId, status);
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = replacementHTML;
          const newSpan = tempDiv.firstChild;
          span.parentNode.replaceChild(newSpan, span);
        }
      });

      // Listen for real-time customer typing statuses (Option B)
      socket.on('typingStatus', ({ contactId, phone, isTyping }) => {
        const contact = contactsMap[activeContactId];
        const isMatched = (contactId && contactId === activeContactId) || 
                          (contact && phone && (contact.phoneNumber === phone || phone.replace('+', '') === contact.phoneNumber));

        if (isMatched) {
          const typingIndicator = document.getElementById('chat-typing-indicator');
          if (typingIndicator) {
            if (isTyping) {
              if (typingTimeout) clearTimeout(typingTimeout);
              typingIndicator.style.display = 'inline-block';
              typingTimeout = setTimeout(() => {
                typingIndicator.style.display = 'none';
              }, 4000);
            } else {
              if (typingTimeout) clearTimeout(typingTimeout);
              typingIndicator.style.display = 'none';
            }
          }
        }
      });

      // Listen for bot enabled/paused handoff toggle updates in real-time (Option A)
      socket.on('contactBotToggled', ({ contactId, botEnabled }) => {
        console.log('Real-Time Contact Bot Toggled:', contactId, botEnabled);
        if (contactsMap[contactId]) {
          contactsMap[contactId].botEnabled = botEnabled;
        }
        if (activeContactId === contactId) {
          const chatBotToggle = document.getElementById('chat-bot-toggle');
          const botPausedBanner = document.getElementById('chat-bot-paused-banner');
          if (chatBotToggle) {
            chatBotToggle.checked = botEnabled;
          }
          if (botPausedBanner) {
            botPausedBanner.style.display = botEnabled ? 'none' : 'inline-block';
          }
        }
        loadChatThreads(false);
      });

      // Listen for contact priority and sentiment updates in real-time (Option H)
      socket.on('contactPriorityUpdated', ({ contactId, sentiment, priority }) => {
        console.log('Real-Time Contact Priority Updated:', contactId, sentiment, priority);
        if (contactsMap[contactId]) {
          contactsMap[contactId].sentiment = sentiment;
          contactsMap[contactId].priority = priority;
        }
        if (activeContactId === contactId) {
          const priorityUrgentBanner = document.getElementById('chat-priority-urgent-banner');
          if (priorityUrgentBanner) {
            priorityUrgentBanner.style.display = priority === 'URGENT' ? 'inline-block' : 'none';
          }
        }
        loadChatThreads(false);
      });

      // Listen for real-time team member additions
      socket.on('teamMemberAdded', (newMember) => {
        console.log('Real-Time Team Member Added:', newMember);
        if (!teamMembers.some(m => m.id === newMember.id)) {
          teamMembers.push(newMember);
          renderTeamMembersInSelect();
        }
      });

      socket.on('contact_updated', ({ contactId, name }) => {
        if (contactsMap[contactId]) {
          contactsMap[contactId].name = name;
          if (activeContactId === contactId) {
            document.getElementById('active-contact-title').innerHTML = `
              ${name || '+' + contactsMap[contactId].phoneNumber}
              <span onclick="editContactName('${contactId}')" style="cursor:pointer; margin-left:8px; font-size:0.8rem; color:var(--text-muted);" title="Edit Name">✎</span>
            `;
          }
          loadChatThreads(false);
        }
      });

      socket.on('humanSupportRequested', ({ contactId, phone }) => {
        // Trigger visual toast
        showToast(`🔔 Customer +${phone} requests Human Support! Bot automatically paused.`, 'warning');
        
        // Play subtle sound if browser allows
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
          audio.volume = 0.5;
          audio.play().catch(e => console.log('Audio autoplay blocked', e));
        } catch (e) {}

        // Reload threads to visually show URGENT priority and bot pause
        loadChatThreads(false);
      });
    }

    // Helper: Toast Notification
    function showToast(message, type = 'info') {
      const container = document.getElementById('toast-container');
      if (!container) return;

      const toast = document.createElement('div');
      
      let bgColor = '#3b82f6'; // info (blue)
      if (type === 'warning') bgColor = '#f59e0b';
      if (type === 'error') bgColor = '#ef4444';
      if (type === 'success') bgColor = '#10b981';

      toast.style.cssText = `
        background: ${bgColor};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        font-size: 0.85rem;
        font-weight: 500;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
        align-items: center;
        gap: 10px;
      `;
      
      toast.innerHTML = `<span>${message}</span>`;
      container.appendChild(toast);

      // Animate in
      requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
      });

      // Remove after 5 seconds
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
      }, 5000);
    }

    // ----------------------------------------------------
    /* API REQUEST WRAPPER: Handles Dummy Workspace Authentication Headers */
    // ----------------------------------------------------
    async function apiRequest(endpoint, options = {}) {
      const url = `${serverUrl}${endpoint}`;
      
      // Set Workspace ID as the Bearer Token in authorization headers
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${workspaceId}`,
        ...options.headers
      };

      const finalOptions = {
        ...options,
        headers
      };

      try {
        const response = await fetch(url, finalOptions);
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || `HTTP error ${response.status}`);
        }
        return data;
      } catch (err) {
        console.error(`API Error on ${endpoint}:`, err);
        throw err;
      }
    }

    // ----------------------------------------------------
    /* TAB 1 LOGIC: OVERVIEW ANALYTICS */
    // ----------------------------------------------------
    async function loadOverviewData() {
      try {
        const data = await apiRequest('/api/workspace');
        currentWorkspace = data.workspace;
        
        // Update wallet displays
        const formattedBalance = `$${Number(data.workspace.walletBalance).toFixed(2)}`;
        if (typeof sidebarWallet !== 'undefined' && sidebarWallet) sidebarWallet.textContent = formattedBalance;
        if (typeof overviewWallet !== 'undefined' && overviewWallet) overviewWallet.textContent = formattedBalance;
        
        const billingWallet = document.getElementById('billing-wallet-balance');
        if (billingWallet) {
          billingWallet.textContent = formattedBalance;
        }
        
        // Update active top header
        if (typeof activeWorkspacePill !== 'undefined' && activeWorkspacePill) {
          activeWorkspacePill.textContent = `Workspace: ${data.workspace.name}`;
        }

        // Update KPIs
        const kpiSent = document.getElementById('kpi-sent');
        if (kpiSent) kpiSent.textContent = data.analytics.totalSent;
        const kpiReceived = document.getElementById('kpi-received');
        if (kpiReceived) kpiReceived.textContent = data.analytics.totalReceived;
        const kpiContacts = document.getElementById('kpi-contacts');
        if (kpiContacts) kpiContacts.textContent = data.analytics.totalContacts;
        const kpiCampaigns = document.getElementById('kpi-campaigns');
        if (kpiCampaigns) kpiCampaigns.textContent = data.analytics.completedCampaigns;

        // Render Inbound vs Outbound message traffic chart
        if (typeof drawTrafficChart === 'function' && document.getElementById('trafficChart')) {
          drawTrafficChart(data.analytics.totalSent, data.analytics.totalReceived);
        }

        // Fetch transaction history to draw credit spend bar ledger
        try {
          const transactions = await apiRequest('/api/billing/transactions');
          transactionsList = transactions;
          if (typeof drawSpendChart === 'function' && document.getElementById('spendChart')) {
            drawSpendChart(transactions);
          }
        } catch (txErr) {
          console.warn('Could not load spend ledger chart:', txErr);
        }

        return true;
      } catch (err) {
        console.error("loadOverviewData Error:", err);
        alert(`Failed to load workspace data. Ensure your server is running and the Workspace ID is created in the database!`);
        if (typeof logoutBtn !== 'undefined' && logoutBtn) logoutBtn.click();
        return false;
      }
    }

    // Refill balance event
    async function handleRefill() {
      try {
        const data = await apiRequest('/api/workspace/refill', { method: 'POST' });
        currentWorkspace = data.workspace;
        
        // Render updated balance
        const formattedBalance = `$${Number(data.workspace.walletBalance).toFixed(2)}`;
        if (typeof sidebarWallet !== 'undefined' && sidebarWallet) sidebarWallet.textContent = formattedBalance;
        if (typeof overviewWallet !== 'undefined' && overviewWallet) overviewWallet.textContent = formattedBalance;
        
        const billingWallet = document.getElementById('billing-wallet-balance');
        if (billingWallet) {
          billingWallet.textContent = formattedBalance;
        }
        
        // Trigger alert banner
        alert(`✓ Wallet successfully credited +$100.00!`);

        // Refresh billing logs if currently on billing tab
        const activeTab = document.querySelector('.menu-item.active').getAttribute('data-tab');
        if (activeTab === 'billing') {
          loadBillingData();
        }
      } catch (err) {
        alert('Failed to refill wallet.');
      }
    }

    if (typeof sidebarRefillBtn !== 'undefined' && sidebarRefillBtn) {
      sidebarRefillBtn.addEventListener('click', handleRefill);
    }
    if (typeof overviewRefillBtn !== 'undefined' && overviewRefillBtn) {
      overviewRefillBtn.addEventListener('click', handleRefill);
    }
    
    document.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'billing-refill-btn') {
        handleRefill();
      }
    });


    // ----------------------------------------------------
    /* TAB 2 LOGIC: SHARED INBOUND SUPPORT CHAT CONSOLE */
    // ----------------------------------------------------
    async function loadChatData() {
      await loadChatThreads(true);
    }

    async function loadChatThreads(selectFirst = false) {
      try {
        const contacts = await apiRequest('/api/contacts');
        const threadsList = document.getElementById('chat-threads-list');
        
        // Update total thread count badge
        document.getElementById('chat-threads-count').textContent = `${contacts.length} threads`;

        if (contacts.length === 0) {
          threadsList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem; font-size: 0.8rem;">No active customer threads</div>`;
          resetChatArea();
          return;
        }

        // Keep track of contacts details locally
        contactsMap = {};
        let listHTML = '';

        contacts.forEach(contact => {
          contactsMap[contact.id] = contact;
          
          const isActive = contact.id === activeContactId;
          const hasMessage = contact.messages && contact.messages.length > 0;
          
          // Form previews
          let preview = 'No messages in this thread';
          let time = '';
          
          if (hasMessage) {
            const msg = contact.messages[0];
            const isInbound = msg.direction === 'INBOUND';
            
            let bodyPreview = '';
            if (msg.content && msg.content.text && msg.content.text.body) {
              bodyPreview = msg.content.text.body;
            } else if (msg.content && msg.content.type === 'image') {
              bodyPreview = '📷 Image Attachment';
            } else if (msg.content && msg.content.type === 'document') {
              bodyPreview = '📄 Document Attachment';
            } else if (msg.content && (msg.content.type === 'audio' || msg.content.type === 'voice')) {
              bodyPreview = '🎵 Voice Recording';
            } else if (msg.content && msg.content.type === 'location') {
              bodyPreview = '📍 Location Pin';
            } else if (msg.content && msg.content.template && msg.content.template.name) {
              bodyPreview = `🚀 Broadcast: ${msg.content.template.name}`;
            } else {
              bodyPreview = `[Outbound status: ${msg.status}]`;
            }
            
            preview = isInbound ? bodyPreview : `You: ${bodyPreview}`;
            
            // Format time
            time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }

          const initials = contact.phoneNumber.substr(contact.phoneNumber.length - 4);
          
          // Form assignment badge (Option F)
          let assignedBadge = '';
          if (contact.assignedAgent) {
            const isMe = contact.assignedAgent === 'Agent Me';
            const initials = isMe ? 'Me' : contact.assignedAgent.replace('Agent ', '').substring(0, 5);
            assignedBadge = `<span style="font-size:0.6rem; font-weight:700; background:${isMe ? 'rgba(16,185,129,0.12)' : 'rgba(59,130,246,0.1)'}; color:${isMe ? '#047857' : '#2563eb'}; padding:0.15rem 0.35rem; border-radius:4px; margin-left:0.35rem; border: 1px solid ${isMe ? 'rgba(16,185,129,0.2)' : 'rgba(59,130,246,0.2)'}; display:inline-block; vertical-align:middle; text-transform:uppercase;">${initials}</span>`;
          }

          // Form bot enabled / paused badge (Option A)
          let botBadge = '';
          if (contact.botEnabled === false) {
            botBadge = `<span style="font-size:0.6rem; font-weight:700; background:rgba(239,68,68,0.08); color:#ef4444; padding:0.15rem 0.35rem; border-radius:4px; margin-left:0.35rem; border: 1px solid rgba(239,68,68,0.15); display:inline-block; vertical-align:middle; text-transform:uppercase;">Live</span>`;
          } else {
            botBadge = `<span style="font-size:0.6rem; font-weight:700; background:rgba(16,185,129,0.08); color:#10b981; padding:0.15rem 0.35rem; border-radius:4px; margin-left:0.35rem; border: 1px solid rgba(16,185,129,0.15); display:inline-block; vertical-align:middle; text-transform:uppercase;">🤖 Bot</span>`;
          }

          // Form sentiment & priority badge (Option H)
          let sentimentBadge = '';
          const sentiment = contact.sentiment || 'NEUTRAL';
          const priority = contact.priority || 'STANDARD';

          let emoji = '😐';
          if (sentiment === 'HAPPY') {
            emoji = '😊';
          } else if (sentiment === 'ANGRY') {
            emoji = '😠';
          } else if (sentiment === 'URGENT') {
            emoji = '🚨';
          }

          let priorityBadge = '';
          if (priority === 'URGENT') {
            priorityBadge = `<span style="font-size:0.55rem; font-weight:800; background:#fee2e2; color:#ef4444; padding:0.1rem 0.3rem; border-radius:4px; margin-left:0.35rem; border: 1px solid #fca5a5; display:inline-block; vertical-align:middle; animation: pulseRed 1.5s infinite ease-in-out; text-transform:uppercase;">🚨 URGENT</span>`;
          } else if (priority === 'HIGH') {
            priorityBadge = `<span style="font-size:0.55rem; font-weight:800; background:#fef3c7; color:#d97706; padding:0.1rem 0.3rem; border-radius:4px; margin-left:0.35rem; border: 1px solid #fde68a; display:inline-block; vertical-align:middle; text-transform:uppercase;">HIGH</span>`;
          }

          sentimentBadge = `<span style="font-size:0.75rem; display:inline-flex; align-items:center; justify-content:center; margin-left:0.35rem;" title="Sentiment: ${sentiment}">${emoji}</span>`;

          let unreadBadge = '';
          if (contact.unreadCount > 0) {
            unreadBadge = `<span style="background-color:#25D366; color:#ffffff; font-size:0.65rem; font-weight:bold; border-radius:50%; min-width:18px; height:18px; display:inline-flex; align-items:center; justify-content:center; padding:0 4px; margin-top:4px;">${contact.unreadCount}</span>`;
          }

          listHTML += `
            <div class="thread-item ${isActive ? 'active' : ''}" onclick="selectThread('${contact.id}')">
              <div class="thread-avatar">${initials}</div>
              <div class="thread-details">
                <div class="thread-contact-info" style="display:flex; justify-content:space-between; align-items:flex-start; width:100%;">
                  <span class="thread-number" style="display:flex; align-items:center; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight: 700; font-size: 0.85rem; color: var(--text-main);">
                    ${contact.name ? contact.name : '+' + contact.phoneNumber}${assignedBadge}${botBadge}${priorityBadge}${sentimentBadge}
                  </span>
                  <div style="display:flex; flex-direction:column; align-items:flex-end; flex-shrink:0;">
                    <span class="thread-time" style="font-size:0.68rem; color:${contact.unreadCount > 0 ? '#25D366' : 'var(--text-muted)'}; font-weight:${contact.unreadCount > 0 ? '700' : 'normal'};">${time}</span>
                    ${unreadBadge}
                  </div>
                </div>
                <div class="thread-preview" style="font-size:0.775rem; color:${contact.unreadCount > 0 ? 'var(--text-main)' : 'var(--text-muted)'}; font-weight:${contact.unreadCount > 0 ? '600' : 'normal'}; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; padding-top:2px;">${preview}</div>
              </div>
            </div>
          `;
        });

        threadsList.innerHTML = listHTML;

        // Auto select first thread if requested
        if (selectFirst && contacts.length > 0 && !activeContactId) {
          selectThread(contacts[0].id);
        }

      } catch (err) {
        console.error('Failed to load chat threads:', err);
        const threadsList = document.getElementById('chat-threads-list');
        if (threadsList) {
          threadsList.innerHTML = `<div style="color:var(--text-danger); padding:1rem; text-align:center; font-size:0.8rem; border:1px solid red; margin:1rem; border-radius:8px;"><b>Error:</b> ${err.message || String(err)}<br><pre style="text-align:left; font-size:10px; margin-top:8px; overflow-x:auto;">${err.stack || ''}</pre></div>`;
        }
      }
    }

    async function selectThread(contactId) {
      activeContactId = contactId;
      
      const contact = contactsMap[contactId];
      if (!contact) return;

      // Optimistically clear the unread notification badge
      if (contact.unreadCount > 0) {
        contact.unreadCount = 0;
      }

      // Update sidebar visual active state
      const items = document.querySelectorAll('.thread-item');
      items.forEach(el => el.classList.remove('active'));
      
      // Make active contact show in list
      loadChatThreads(false);

      // Restore ticket assignee selector in the header (Option F)
      const assigneeSelect = document.getElementById('chat-assignee-select');
      if (assigneeSelect) {
        assigneeSelect.value = contact.assignedAgent || 'Unassigned';
        // Sync permission locked/unlocked state instantly
        syncAssigneeSelectState();
      }

      // Restore Auto-Bot Handoff toggle in the header (Option A)
      const botToggle = document.getElementById('chat-bot-toggle');
      const botPausedBanner = document.getElementById('chat-bot-paused-banner');
      if (botToggle) {
        botToggle.checked = contact.botEnabled !== false;
      }
      if (botPausedBanner) {
        botPausedBanner.style.display = contact.botEnabled === false ? 'inline-block' : 'none';
      }

      // Restore Urgent Priority banner in the header (Option H)
      const priorityUrgentBanner = document.getElementById('chat-priority-urgent-banner');
      if (priorityUrgentBanner) {
        priorityUrgentBanner.style.display = contact.priority === 'URGENT' ? 'inline-block' : 'none';
      }

      // Unhide chat windows & input bars
      document.getElementById('active-chat-header').style.display = 'flex';
      document.getElementById('active-chat-messages').innerHTML = '';
      document.getElementById('active-chat-input-bar').style.display = 'flex';
      document.getElementById('chat-details-sidebar').style.display = 'flex';

      // Mobile slide-over active chat window
      const chatView = document.querySelector('.chat-view');
      if (chatView) {
        chatView.classList.add('active-chat-open');
      }

      // Load thread inspector info
      document.getElementById('active-contact-title').innerHTML = `
        ${contact.name || '+' + contact.phoneNumber}
        <span onclick="editContactName('${contact.id}')" style="cursor:pointer; margin-left:8px; font-size:0.8rem; color:var(--text-muted);" title="Edit Name">✎</span>
      `;
      document.getElementById('inspector-phone').textContent = `+${contact.phoneNumber}`;
      document.getElementById('inspector-opt-in').innerHTML = contact.optInStatus ? '<span style="color:var(--success)">✓ Opted In</span>' : '<span style="color:var(--danger)">✗ Opted Out</span>';
      document.getElementById('inspector-id').textContent = contact.id;

      // Load conversation history logs
      try {
        const messages = await apiRequest(`/api/messages/${contactId}`);
        const messagesContainer = document.getElementById('active-chat-messages');

        if (messages.length === 0) {
          messagesContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem; font-size: 0.8rem;">Empty support thread</div>`;
          return;
        }

        messages.forEach(msg => {
          appendChatBubble(msg);
        });

      } catch (err) {
        console.error('Failed to fetch messages for contact:', err);
      }
    }

    function getStatusCheckmarkHTML(messageId, status) {
      let ticks = '';
      let style = 'color: #64748b; font-weight: bold; margin-left: 0.35rem; font-size: 0.78rem; transition: all 0.3s ease; display: inline-block;';
      
      if (status === 'SENT') {
        ticks = '✓';
      } else if (status === 'DELIVERED') {
        ticks = '✓✓';
      } else if (status === 'READ') {
        ticks = '✓✓';
        style = 'color: #10b981; font-weight: bold; margin-left: 0.35rem; font-size: 0.78rem; transition: all 0.3s ease; display: inline-block; text-shadow: 0 0 4px rgba(16,185,129,0.3);';
      } else if (status === 'FAILED') {
        ticks = '✗ Failed';
        style = 'color: #ef4444; font-weight: bold; margin-left: 0.35rem; font-size: 0.7rem;';
      } else {
        ticks = status;
      }
      
      return `<span class="status-check-span" id="status-span-${messageId}" style="${style}">${ticks}</span>`;
    }

    function appendChatBubble(message) {
      const messagesContainer = document.getElementById('active-chat-messages');
      
      // Remove empty chat placeholder if exists
      const placeholder = document.getElementById('chat-empty-placeholder');
      if (placeholder) placeholder.remove();

      const bubbleRow = document.createElement('div');
      const isInbound = message.direction === 'INBOUND';
      bubbleRow.className = `chat-bubble-row ${isInbound ? 'inbound' : 'outbound'}`;

      // Extract text content body
      let bodyText = '';
      const msgType = message.content ? message.content.type : undefined;

      if (msgType === 'image') {
        const imageObj = message.content.image;
        const mediaId = imageObj.id;
        const caption = imageObj.caption || '';
        const proxySrc = `${serverUrl}/api/media/${mediaId}?token=${workspaceId}&type=image`;
        bodyText = `
          <div style="margin-bottom:0.25rem; display:flex; flex-direction:column; gap:0.25rem; width: 100%;">
            <img src="${proxySrc}" alt="${caption}" style="max-width:100%; width: 240px; border-radius:12px; border:1px solid var(--border-light); max-height:200px; object-fit:cover; transition: transform 0.25s ease; cursor:pointer;" onclick="window.open('${proxySrc}', '_blank')" onmouseover="this.style.transform='scale(1.015)'" onmouseout="this.style.transform='scale(1)'">
            ${caption ? `<span style="font-size:0.825rem; color:var(--text-main); margin-top:0.25rem; display:block;">${caption}</span>` : ''}
          </div>
        `;
      } else if (msgType === 'document') {
        const docObj = message.content.document;
        const mediaId = docObj.id;
        const filename = docObj.filename || 'Document.pdf';
        const caption = docObj.caption || '';
        const proxySrc = `${serverUrl}/api/media/${mediaId}?token=${workspaceId}&type=pdf`;
        bodyText = `
          <div style="background:rgba(0,0,0,0.02); border:1px solid var(--border-light); border-radius:12px; padding:0.85rem; display:flex; flex-direction:column; gap:0.75rem; width: 240px;">
            <div style="display:flex; align-items:center; gap:0.75rem;">
              <div style="width:36px; height:36px; background:rgba(16,185,129,0.08); border-radius:8px; display:flex; align-items:center; justify-content:center; color:var(--primary); font-size:1.25rem;">📄</div>
              <div style="overflow:hidden; flex:1;">
                <div style="font-weight:600; font-size:0.825rem; color:var(--text-main); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${filename}</div>
                <div style="font-size:0.7rem; color:var(--text-muted);">PDF/Document Attachment</div>
              </div>
            </div>
            ${caption ? `<span style="font-size:0.8rem; color:var(--text-muted);">${caption}</span>` : ''}
            <a href="${proxySrc}" target="_blank" class="btn" style="padding:0.45rem; font-size:0.75rem; border-radius:8px; width:100%; text-decoration:none; text-align:center; box-shadow: none;">
              📥 Download Document
            </a>
          </div>
        `;
      } else if (msgType === 'audio' || msgType === 'voice') {
        const audioObj = message.content.audio || message.content.voice;
        const mediaId = audioObj.id;
        const proxySrc = `${serverUrl}/api/media/${mediaId}?token=${workspaceId}&type=audio`;
        bodyText = `
          <div style="display:flex; flex-direction:column; gap:0.5rem; width: 240px;">
            <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600; display:flex; align-items:center; gap:0.25rem;">🎵 Customer Voice Note</span>
            <audio controls style="width:100%; height:32px;">
              <source src="${proxySrc}" type="${audioObj.mime_type}">
              Your browser does not support the audio element.
            </audio>
          </div>
        `;
      } else if (msgType === 'location') {
        const locObj = message.content.location;
        const lat = locObj.latitude;
        const lng = locObj.longitude;
        const name = locObj.name || 'Pinned Location';
        const address = locObj.address || '';
        const mapsLink = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
        bodyText = `
          <div style="background:rgba(0,0,0,0.02); border:1px solid var(--border-light); border-radius:12px; padding:0.85rem; display:flex; flex-direction:column; gap:0.5rem; width: 240px;">
            <div style="font-weight:600; font-size:0.85rem; color:var(--text-main); display:flex; align-items:center; gap:0.25rem;">📍 ${name}</div>
            ${address ? `<div style="font-size:0.75rem; color:var(--text-muted); line-height:1.3; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${address}</div>` : ''}
            <div style="font-size:0.7rem; font-family:monospace; color:var(--text-muted);">Coords: ${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
            <a href="${mapsLink}" target="_blank" class="btn" style="padding:0.45rem; font-size:0.75rem; border-radius:8px; width:100%; text-decoration:none; text-align:center; box-shadow: none;">
              🗺️ Open in Google Maps
            </a>
          </div>
        `;
      } else {
        if (isInbound) {
          if (message.content.text && message.content.text.body) {
            bodyText = message.content.text.body;
          } else if (msgType === 'interactive') {
            const intType = message.content.interactive?.type;
            if (intType === 'list_reply') {
              bodyText = `📋 [Menu Selected] <b>${message.content.interactive.list_reply.title || message.content.interactive.list_reply.id}</b>`;
            } else if (intType === 'button_reply') {
              bodyText = `🔘 [Button Clicked] <b>${message.content.interactive.button_reply.title || message.content.interactive.button_reply.id}</b>`;
            } else {
              bodyText = `[Interactive Reply]`;
            }
          } else if (message.content.button && message.content.button.text) {
            bodyText = `[Clicked Button] ${message.content.button.text}`;
          } else {
            bodyText = `[Event: ${msgType || 'System Event'}]`;
          }
        } else {
          // Outbound text messages
          if (msgType === 'interactive') {
            const intType = message.content.interactive?.type;
            if (intType === 'list') {
              const header = message.content.interactive.header?.text || '';
              const body = message.content.interactive.body?.text || 'Choose an option';
              bodyText = `<div style="background:rgba(0,0,0,0.02); border:1px solid var(--border-light); border-radius:12px; padding:0.85rem; width: 240px;">
                ${header ? `<b>${header}</b><br>` : ''}
                ${body}
                <br><br><span style="color:var(--primary); font-weight:bold;">☷ ${message.content.interactive.action?.button || 'Menu'}</span>
              </div>`;
            } else {
              bodyText = `[Interactive Menu Sent]`;
            }
          } else if (message.content.text && message.content.text.body) {
            bodyText = message.content.text.body;
          } else if (message.content && message.content.template && message.content.template.name) {
            bodyText = `🚀 Marketing Template Sent: "${message.content.template.name}"`;
          } else {
            bodyText = `Outbound message processed.`;
          }
        }
      }

      // Checkmarks or fail indicators
      let statusIcon = '';
      if (!isInbound) {
        statusIcon = getStatusCheckmarkHTML(message.id, message.status);
      }

      const timeStr = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const metaId = 'meta-' + Math.random().toString(36).substr(2, 9);

      bubbleRow.innerHTML = `
        <div class="chat-bubble">
          <div>${bodyText}</div>
          <span class="bubble-time ${isInbound ? 'inbound' : ''}">
            ${timeStr} ${statusIcon}
          </span>
          <button class="toggle-meta-link" onclick="toggleBubbleMeta('${metaId}')">Inspect Webhook Payload</button>
          <pre class="bubble-meta" id="${metaId}">${JSON.stringify(message.content, null, 2)}</pre>
        </div>
      `;

      messagesContainer.appendChild(bubbleRow);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Toggle meta inspection
    function toggleBubbleMeta(id) {
      const el = document.getElementById(id);
      el.style.display = el.style.display === 'block' ? 'none' : 'block';
    }

    function resetChatArea() {
      document.getElementById('active-chat-header').style.display = 'none';
      document.getElementById('active-chat-input-bar').style.display = 'none';
      document.getElementById('chat-details-sidebar').style.display = 'none';
      const chatView = document.querySelector('.chat-view');
      if (chatView) {
        chatView.classList.remove('active-chat-open');
      }
      document.getElementById('active-chat-messages').innerHTML = `
        <div class="empty-chat-placeholder" id="chat-empty-placeholder">
          <div class="empty-icon">💬</div>
          <h3>No Thread Selected</h3>
          <p style="font-size: 0.85rem; margin-top: 0.5rem; max-width: 280px; line-height: 1.45;">
            Select an active customer thread from the left panel to load their conversation log and send manual replies.
          </p>
        </div>
      `;
    }

    // Handling Send Support Message Action
    const chatInput = document.getElementById('chat-message-input');
    const chatSendBtn = document.getElementById('chat-send-btn');

    async function sendSupportMessage() {
      const text = chatInput.value.trim();
      if (!text || !activeContactId) return;

      chatInput.disabled = true;
      chatSendBtn.disabled = true;

      try {
        const response = await apiRequest('/api/support/send', {
          method: 'POST',
          body: JSON.stringify({
            contactId: activeContactId,
            messageText: text
          })
        });

        // Clear input console
        chatInput.value = '';
        
        // Refresh sidebar wallet balance
        loadOverviewData();

      } catch (err) {
        console.error('Failed to deliver support reply:', err);
        alert(`Failed to send message: ${err.message}`);
      } finally {
        chatInput.disabled = false;
        chatSendBtn.disabled = false;
        chatInput.focus();
      }
    }

    chatSendBtn.addEventListener('click', sendSupportMessage);
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendSupportMessage();
    });


    // ----------------------------------------------------
    /* TAB 3 LOGIC: MARKETING BROADCASTS */
    // ----------------------------------------------------
    const campaignModal = document.getElementById('campaign-modal');
    const openCampaignModalBtn = document.getElementById('btn-open-campaign-modal');
    const closeCampaignModalBtn = document.getElementById('btn-close-campaign-modal');
    const campaignForm = document.getElementById('dashboard-campaign-form');
    const campaignPhoneInput = document.getElementById('campaign-phone');
    const campaignTemplateSelect = document.getElementById('campaign-template-select');
    const modalBanner = document.getElementById('modal-campaign-banner');
    const submitCampaignBtn = document.getElementById('btn-submit-campaign');

    // Scheduler DOM elements (Option I)
    const scheduleToggle = document.getElementById('campaign-schedule-toggle');
    const schedulePanel = document.getElementById('campaign-schedule-panel');
    const scheduledAtInput = document.getElementById('campaign-scheduled-at');

    scheduleToggle.addEventListener('change', () => {
      if (scheduleToggle.checked) {
        schedulePanel.style.display = 'block';
        scheduledAtInput.setAttribute('required', '');
      } else {
        schedulePanel.style.display = 'none';
        scheduledAtInput.removeAttribute('required');
        scheduledAtInput.value = '';
      }
    });

    openCampaignModalBtn.addEventListener('click', () => {
      modalBanner.style.display = 'none';
      campaignForm.reset();
      
      // Reset scheduling panel state
      scheduleToggle.checked = false;
      schedulePanel.style.display = 'none';
      scheduledAtInput.removeAttribute('required');
      scheduledAtInput.value = '';

      loadTemplatesData();
      campaignModal.classList.add('active');
    });

    closeCampaignModalBtn.addEventListener('click', () => {
      campaignModal.classList.remove('active');
    });

    // Campaign Recipient Mode Toggle & Bulk CSV Parser Variables (Option E)
    const btnModeSingle = document.getElementById('btn-mode-single');
    const btnModeBulk = document.getElementById('btn-mode-bulk');
    const groupSingle = document.getElementById('group-recipient-single');
    const groupBulk = document.getElementById('group-recipient-bulk');
    const csvDropzone = document.getElementById('csv-dropzone');
    const csvFileInput = document.getElementById('csv-file-input');
    const csvSummaryCard = document.getElementById('csv-summary-card');
    const csvSummaryTitle = document.getElementById('csv-summary-title');
    const csvSummaryCost = document.getElementById('csv-summary-cost');
    const csvPreviewList = document.getElementById('csv-preview-list');
    const btnClearCsv = document.getElementById('btn-clear-csv');

    let recipientMode = 'single';
    let parsedBulkPhones = [];

    // Recipient Toggle Event Listeners
    btnModeSingle.addEventListener('click', () => {
      recipientMode = 'single';
      btnModeSingle.style.background = 'var(--primary)';
      btnModeSingle.style.color = '#fff';
      btnModeSingle.style.fontWeight = '600';
      btnModeBulk.style.background = 'transparent';
      btnModeBulk.style.color = 'var(--text-muted)';
      btnModeBulk.style.fontWeight = '500';

      groupSingle.style.display = 'block';
      groupBulk.style.display = 'none';
      campaignPhoneInput.setAttribute('required', '');
      
      modalBanner.style.display = 'none';
      submitCampaignBtn.disabled = false;
    });

    btnModeBulk.addEventListener('click', () => {
      recipientMode = 'bulk';
      btnModeBulk.style.background = 'var(--primary)';
      btnModeBulk.style.color = '#fff';
      btnModeBulk.style.fontWeight = '600';
      btnModeSingle.style.background = 'transparent';
      btnModeSingle.style.color = 'var(--text-muted)';
      btnModeSingle.style.fontWeight = '500';

      groupSingle.style.display = 'none';
      groupBulk.style.display = 'block';
      campaignPhoneInput.removeAttribute('required');
      
      validateBulkState();
    });

    // Drag and Drop Uploader Listeners
    csvDropzone.addEventListener('click', () => csvFileInput.click());

    csvDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      csvDropzone.style.borderColor = 'var(--primary)';
      csvDropzone.style.background = 'rgba(16, 185, 129, 0.06)';
    });

    ['dragleave', 'dragend'].forEach(evt => {
      csvDropzone.addEventListener(evt, () => {
        csvDropzone.style.borderColor = 'rgba(16, 185, 129, 0.25)';
        csvDropzone.style.background = 'rgba(16, 185, 129, 0.02)';
      });
    });

    csvDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      csvDropzone.style.borderColor = 'rgba(16, 185, 129, 0.25)';
      csvDropzone.style.background = 'rgba(16, 185, 129, 0.02)';
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.csv')) {
        handleCsvFile(file);
      } else {
        alert('Please upload a valid .csv file!');
      }
    });

    csvFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handleCsvFile(file);
      }
    });

    btnClearCsv.addEventListener('click', () => {
      clearBulkState();
    });

    function clearBulkState() {
      parsedBulkPhones = [];
      csvFileInput.value = '';
      csvSummaryCard.style.display = 'none';
      csvDropzone.style.display = 'block';
      modalBanner.style.display = 'none';
      submitCampaignBtn.disabled = false;
    }

    function validateBulkState() {
      if (recipientMode === 'bulk') {
        if (parsedBulkPhones.length === 0) {
          modalBanner.className = 'banner error';
          modalBanner.textContent = '✗ Please upload a CSV file with valid phone numbers.';
          modalBanner.style.display = 'flex';
          submitCampaignBtn.disabled = true;
        } else {
          // Compare estimated cost with current prepaid wallet balance
          const balance = Number(currentWorkspace ? currentWorkspace.walletBalance : 0);
          const cost = parsedBulkPhones.length * 0.05;
          if (balance < cost) {
            modalBanner.className = 'banner error';
            modalBanner.textContent = `✗ Insufficient balance: Campaign cost is $${cost.toFixed(2)}, but wallet balance is $${balance.toFixed(2)}. Please refill your wallet.`;
            modalBanner.style.display = 'flex';
            submitCampaignBtn.disabled = true;
          } else {
            modalBanner.style.display = 'none';
            submitCampaignBtn.disabled = false;
          }
        }
      }
    }

    function handleCsvFile(file) {
      const reader = new FileReader();
      reader.onload = function(e) {
        const text = e.target.result;
        parseCsvData(text);
      };
      reader.readAsText(file);
    }

    function parseCsvData(text) {
      const lines = text.split(/\r?\n/);
      const validNumbers = [];
      
      lines.forEach(line => {
        if (!line.trim()) return;
        
        // Parse CSV lines (checks columns for valid 7-15 digit phone numbers)
        const parts = line.split(',');
        let extractedNum = '';
        
        for (let part of parts) {
          const cleaned = part.trim().replace(/[^\d+]/g, '');
          const numeric = cleaned.replace(/\+/g, '');
          if (numeric.length >= 7 && numeric.length <= 15) {
            extractedNum = numeric;
            break;
          }
        }
        
        if (extractedNum) {
          validNumbers.push(extractedNum);
        }
      });

      // Dedup numbers list
      parsedBulkPhones = [...new Set(validNumbers)];
      
      // Update parsed uploader summary cards
      csvSummaryTitle.textContent = `${parsedBulkPhones.length} Contacts Found`;
      const cost = parsedBulkPhones.length * 0.05;
      csvSummaryCost.textContent = `Estimated Campaign Cost: $${cost.toFixed(2)} ($0.05 per recipient)`;
      
      // Generate preview list
      let previewHtml = '';
      const previewCount = Math.min(parsedBulkPhones.length, 10);
      for (let i = 0; i < previewCount; i++) {
        previewHtml += `<div style="display:flex; justify-content:space-between; margin-bottom:0.15rem;"><span>👤 Recipient #${i+1}</span><span style="font-weight:600; color:var(--text-main);">+${parsedBulkPhones[i]}</span></div>`;
      }
      if (parsedBulkPhones.length > 10) {
        previewHtml += `<div style="text-align:center; font-style:italic; font-size:0.65rem; margin-top:0.35rem; color:var(--primary); font-weight:600;">... and ${parsedBulkPhones.length - 10} more recipients</div>`;
      }
      csvPreviewList.innerHTML = previewHtml;
      
      csvDropzone.style.display = 'none';
      csvSummaryCard.style.display = 'block';
      
      validateBulkState();
    }

    // Load campaigns logs list
    async function loadCampaignsData() {
      try {
        const campaigns = await apiRequest('/api/campaigns');
        const tbody = document.getElementById('campaign-logs-table-body');

        if (campaigns.length === 0) {
          tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">No campaigns launched yet.</td></tr>`;
          loadTemplatesData();
          return;
        }

        let html = '';
        campaigns.forEach(camp => {
          let badgeClass = 'processing';
          if (camp.status === 'COMPLETED') {
            badgeClass = 'completed';
          } else if (camp.status === 'SCHEDULED') {
            badgeClass = 'scheduled';
          } else if (camp.status === 'CANCELLED') {
            badgeClass = 'cancelled';
          }

          const releaseStr = (camp.status === 'SCHEDULED' && camp.scheduledAt)
            ? `⏰ Release: ${new Date(camp.scheduledAt).toLocaleString()}`
            : new Date(camp.createdAt).toLocaleString();

          const actionBtnHtml = camp.status === 'SCHEDULED'
            ? `<button class="btn" style="background:#ef4444; color:#fff; border:none; padding:0.25rem 0.6rem; font-size:0.7rem; border-radius:6px; font-weight:600; cursor:pointer; transition: all 0.2s;" onmouseover="this.style.background='#dc2626'" onmouseout="this.style.background='#ef4444'" onclick="triggerCancelCampaign('${camp.id}', this)">Cancel</button>`
            : `<span style="color:var(--text-muted); font-size:0.75rem;">—</span>`;

          html += `
            <tr>
              <td style="font-family: monospace; font-size: 0.75rem; color:#a78bfa;">${camp.id}</td>
              <td style="font-weight:600;">${camp.templateName}</td>
              <td>
                <span class="badge-status ${badgeClass}">
                  <span class="badge-status-dot"></span>
                  ${camp.status}
                </span>
              </td>
              <td style="color:var(--text-muted); font-size:0.78rem;">${releaseStr}</td>
              <td style="text-align: right;">${actionBtnHtml}</td>
            </tr>
          `;
        });

        tbody.innerHTML = html;
        loadTemplatesData();
      } catch (err) {
        console.error('Failed to load campaigns list:', err);
      }
    }

    // Globally exposed handler for campaign cancellations
    window.triggerCancelCampaign = async function(campaignId, btnElement) {
      if (!confirm('Are you sure you want to cancel this scheduled campaign?')) {
        return;
      }
      
      const originalText = btnElement.textContent;
      btnElement.disabled = true;
      btnElement.textContent = 'Cancelling...';

      try {
        await apiRequest(`/api/campaigns/${campaignId}`, {
          method: 'DELETE'
        });
        loadCampaignsData();
      } catch (err) {
        alert(`Failed to cancel campaign: ${err.message}`);
        btnElement.disabled = false;
        btnElement.textContent = originalText;
      }
    };

    // Trigger Campaign Form Submit (Option E Upgrades)
    campaignForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const template = campaignTemplateSelect.value;
      let targetPhones = [];

      if (recipientMode === 'single') {
        const phone = campaignPhoneInput.value.trim().replace(/[^\d]/g, '');
        if (!phone) {
          alert('Please enter a valid recipient phone number.');
          return;
        }
        targetPhones = [phone];
      } else {
        if (parsedBulkPhones.length === 0) {
          alert('Please upload a CSV file with valid contacts first.');
          return;
        }
        targetPhones = parsedBulkPhones;
      }

      modalBanner.style.display = 'none';
      submitCampaignBtn.disabled = true;
      submitCampaignBtn.textContent = 'Enqueuing...';

      try {
        const payload = {
          templateName: template,
          phoneNumbers: targetPhones
        };

        if (scheduleToggle.checked && scheduledAtInput.value) {
          payload.scheduledAt = new Date(scheduledAtInput.value).toISOString();
        }

        const response = await apiRequest('/api/broadcast', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        modalBanner.className = 'banner success';
        if (response.status === 'SCHEDULED') {
          modalBanner.innerHTML = `✓ Campaign successfully scheduled!<br><span style="font-size:0.75rem;">Scheduled execution for ${new Date(scheduledAtInput.value).toLocaleString()}.</span>`;
        } else {
          modalBanner.innerHTML = `✓ Campaign successfully enqueued!<br><span style="font-size:0.75rem;">Queued ${targetPhones.length} broadcast recipients in BullMQ.</span>`;
        }
        modalBanner.style.display = 'flex';

        // Refresh overview metrics & campaigns logs list
        loadCampaignsData();
        loadOverviewData();

        setTimeout(() => {
          campaignModal.classList.remove('active');
          clearBulkState();
        }, 2000);

      } catch (err) {
        modalBanner.className = 'banner error';
        modalBanner.textContent = `✗ Failed: ${err.message}`;
        modalBanner.style.display = 'flex';
      } finally {
        submitCampaignBtn.disabled = false;
        submitCampaignBtn.textContent = 'Enqueue Campaign';
      }
    });


    // ----------------------------------------------------
    /* TAB 4 LOGIC: CREDIT BILLING & TRANSACTION HISTORY */
    // ----------------------------------------------------
    async function loadBillingData() {
      try {
        const transactions = await apiRequest('/api/billing/transactions');
        transactionsList = transactions; // store globally for printing
        
        const tbody = document.getElementById('billing-logs-table-body');
        
        if (!transactions || transactions.length === 0) {
          tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 3rem;">No transactions recorded yet.</td></tr>`;
          return;
        }

        let html = '';
        transactions.forEach(tx => {
          const isRefill = tx.type === 'REFILL';
          const amountNum = Number(tx.amount);
          const formattedAmount = isRefill ? `+$${amountNum.toFixed(2)}` : `-$${Math.abs(amountNum).toFixed(2)}`;
          const txBadgeClass = isRefill ? 'badge-tx refill' : 'badge-tx charge';
          const dateStr = new Date(tx.createdAt).toLocaleString();
          
          html += `
            <tr>
              <td style="font-family: monospace; font-size: 0.75rem; color: #64748b;">${tx.id.substring(0, 8)}...</td>
              <td>
                <span class="${txBadgeClass}">
                  <span class="badge-status-dot"></span>
                  ${tx.type}
                </span>
              </td>
              <td style="font-weight: 700; color: ${isRefill ? '#10b981' : '#ef4444'};">${formattedAmount}</td>
              <td style="color: var(--text-main); font-weight: 500;">${tx.description}</td>
              <td style="color: var(--text-muted); font-size: 0.8rem;">${dateStr}</td>
              <td style="text-align: right;">
                <button class="refill-btn no-print" style="width: auto; display: inline-flex; padding: 0.35rem 0.75rem; font-size: 0.7rem; border-radius: 6px; box-shadow: none;" onclick="triggerReceiptPrint('${tx.id}')">
                  📄 Receipt
                </button>
              </td>
            </tr>
          `;
        });

        tbody.innerHTML = html;
      } catch (err) {
        console.error('Failed to load transaction logs:', err);
      }
    }

    function triggerReceiptPrint(txId) {
      const tx = transactionsList.find(t => t.id === txId);
      if (!tx) {
        alert('Transaction details not found.');
        return;
      }

      const isRefill = tx.type === 'REFILL';
      const amountNum = Math.abs(Number(tx.amount));
      const formattedAmount = `$${amountNum.toFixed(2)}`;
      const dateStr = new Date(tx.createdAt).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
      const timeStr = new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      const workspaceName = currentWorkspace ? currentWorkspace.name : 'Active Workspace';
      const workspaceIdStr = currentWorkspace ? currentWorkspace.id : workspaceId;

      const modalContent = document.getElementById('printable-receipt-content');
      
      modalContent.innerHTML = `
        <!-- RECEIPT BRAND HEADER -->
        <div class="receipt-header">
          <div>
            <div class="receipt-title">CHATMAGAL LTD.</div>
            <div class="receipt-meta-info" style="margin-top: 0.25rem;">
              100 Innovation Way, Suite 400<br>
              London, EC1A 1BB<br>
              billing@chatmagal.com
            </div>
          </div>
          <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end;">
            <span class="paid-stamp">PAID</span>
            <div class="receipt-meta-info" style="margin-top: 0.5rem; font-family: monospace; font-size: 0.7rem;">
              Invoice #: INV-${tx.id.substring(0, 8).toUpperCase()}<br>
              Date: ${dateStr}<br>
              Time: ${timeStr}
            </div>
          </div>
        </div>

        <!-- CUSTOMER AND METHOD INFO -->
        <div style="display: flex; justify-content: space-between; margin-bottom: 1.5rem; font-size: 0.8rem; line-height: 1.5;">
          <div>
            <strong style="color: #64748b; text-transform: uppercase; font-size: 0.65rem; letter-spacing: 0.5px; display: block; margin-bottom: 0.25rem;">BILLED TO:</strong>
            <span style="font-weight: 700; color: var(--text-main); font-size: 0.85rem;">${workspaceName}</span><br>
            <span style="font-family: monospace; color: #64748b; font-size: 0.7rem;">ID: ${workspaceIdStr}</span>
          </div>
          <div style="text-align: right;">
            <strong style="color: #64748b; text-transform: uppercase; font-size: 0.65rem; letter-spacing: 0.5px; display: block; margin-bottom: 0.25rem;">PAYMENT METHOD:</strong>
            <span style="font-weight: 600; color: var(--text-main);">Prepaid Account Credits</span><br>
            <span style="color: #64748b;">Internal Balance Refill</span>
          </div>
        </div>

        <!-- RECEIPT ITEMS TABLE -->
        <table class="receipt-table">
          <thead>
            <tr>
              <th>Item / Charge Description</th>
              <th style="text-align: right;">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="font-weight: 600; color: var(--text-main); text-align: left;">
                ${tx.description}
                <div style="font-size: 0.7rem; color: #64748b; font-weight: normal; margin-top: 0.2rem;">
                  Category: ${isRefill ? 'Prepaid Ledger Top Up' : 'Support Message Charge'}
                </div>
              </td>
              <td style="text-align: right; font-weight: 700; color: var(--text-main); font-family: 'Outfit', sans-serif;">
                ${formattedAmount}
              </td>
            </tr>
          </tbody>
        </table>

        <!-- TOTALS BLOCK -->
        <div class="receipt-total-row">
          <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: #64748b; letter-spacing: 0.5px;">Grand Total (Paid)</span>
          <span style="font-size: 1.4rem; font-weight: 800; color: #10b981; font-family: 'Outfit', sans-serif;">${formattedAmount}</span>
        </div>

        <!-- TERMS / FOOTER -->
        <div style="margin-top: 2rem; border-top: 1px solid #f1f5f9; padding-top: 1rem; text-align: center; font-size: 0.7rem; color: #94a3b8; line-height: 1.5;">
          Thank you for choosing Chatmagal! This receipt serves as proof of prepaid debit matching your account balance.
          <br><span style="font-family: monospace;">TX-REF-ID: ${tx.id}</span>
        </div>

        <!-- ACTIONS ROW -->
        <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 2rem;" class="no-print">
          <button class="btn btn-secondary" style="padding: 0.5rem 1rem; font-size: 0.75rem; border-radius: 8px;" onclick="closeReceiptModal()">Close Receipt</button>
          <button class="btn" style="padding: 0.5rem 1.25rem; font-size: 0.75rem; border-radius: 8px;" onclick="printReceipt()">🖨️ Print Receipt</button>
        </div>
      `;

      // Open Modal Overlay
      document.getElementById('receipt-modal').classList.add('active');
    }

    function closeReceiptModal() {
      document.getElementById('receipt-modal').classList.remove('active');
    }

    function printReceipt() {
      window.print();
    }

    function drawTrafficChart(totalSent, totalReceived) {
      const ctx = document.getElementById('trafficChart').getContext('2d');
      
      if (trafficChart) {
        trafficChart.destroy();
      }

      const sent = totalSent || 0;
      const received = totalReceived || 0;
      const hasData = sent > 0 || received > 0;
      
      trafficChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Outbound Messages', 'Inbound Messages'],
          datasets: [{
            data: hasData ? [sent, received] : [1, 1],
            backgroundColor: hasData ? ['#10b981', '#64748b'] : ['#e2e8f0', '#f1f5f9'],
            borderWidth: 0,
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                font: {
                  family: 'Plus Jakarta Sans',
                  size: 11,
                  weight: '600'
                },
                color: '#64748b'
              }
            },
            tooltip: {
              enabled: hasData
            }
          },
          cutout: '70%'
        }
      });
    }

    function drawSpendChart(transactions) {
      const ctx = document.getElementById('spendChart').getContext('2d');
      
      if (spendChart) {
        spendChart.destroy();
      }

      const displayTxs = [...transactions].slice(0, 10).reverse();
      
      const labels = displayTxs.map(tx => {
        const d = new Date(tx.createdAt);
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      });

      const data = displayTxs.map(tx => Number(tx.amount));
      const backgroundColors = displayTxs.map(tx => tx.type === 'REFILL' ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)');
      const borderColors = displayTxs.map(tx => tx.type === 'REFILL' ? '#10b981' : '#ef4444');

      const hasData = displayTxs.length > 0;

      spendChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: hasData ? labels : ['No Data'],
          datasets: [{
            label: 'Transaction Amount ($)',
            data: hasData ? data : [0],
            backgroundColor: hasData ? backgroundColors : ['#e2e8f0'],
            borderColor: hasData ? borderColors : ['#cbd5e1'],
            borderWidth: 1.5,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const val = context.raw;
                  return val >= 0 ? `Refill: +$${val.toFixed(2)}` : `Charge: -$${Math.abs(val).toFixed(2)}`;
                }
              }
            }
          },
          scales: {
            y: {
              grid: {
                color: 'rgba(15, 23, 42, 0.04)'
              },
              ticks: {
                color: '#64748b',
                font: {
                  family: 'Plus Jakarta Sans',
                  size: 10
                },
                callback: function(value) {
                  return '$' + value;
                }
              }
            },
            x: {
              grid: {
                display: false
              },
              ticks: {
                color: '#64748b',
                font: {
                  family: 'Plus Jakarta Sans',
                  size: 10
                }
              }
            }
          }
        }
      });
    }

    // Approved Meta Templates Dataset (Option D)
    const APPROVED_TEMPLATES = [
      {
        name: 'hello_world',
        language: 'en_US',
        category: 'UTILITY',
        status: 'APPROVED',
        body: 'Welcome to Chatmagal! Thank you for subscribing. We will keep you updated on all important account activity.'
      },
      {
        name: 'appointment_reminder',
        language: 'en_US',
        category: 'UTILITY',
        status: 'APPROVED',
        body: 'Hello! This is a reminder that your appointment is scheduled for tomorrow at {{1}}. Please reply with YES to confirm.'
      },
      {
        name: 'shipping_update',
        language: 'en_US',
        category: 'UTILITY',
        status: 'APPROVED',
        body: 'Good news! Your order {{1}} has shipped and is on its way. Track your delivery here: https://chatmagal.com/track/{{2}}'
      },
      {
        name: 'special_promotion',
        language: 'en_US',
        category: 'MARKETING',
        status: 'APPROVED',
        body: 'Exclusive Offer! 🎉 Top up your wallet today and get 10% extra credit. Use code TOPUP10 at checkout.'
      }
    ];

    function loadTemplatesData() {
      // 1. Populate Templates table in pane-campaigns
      const tbody = document.getElementById('meta-templates-table-body');
      if (!tbody) return;

      let html = '';
      APPROVED_TEMPLATES.forEach(tmpl => {
        html += `
          <tr>
            <td style="font-weight:700; color:var(--text-main);">${tmpl.name}</td>
            <td style="font-family:monospace; font-size:0.75rem; color:var(--text-muted);">${tmpl.language}</td>
            <td>
              <span class="badge-status" style="background:rgba(100,116,139,0.06); border-color:rgba(100,116,139,0.15); color:#64748b; padding:0.2rem 0.5rem;">
                ${tmpl.category}
              </span>
            </td>
            <td>
              <span class="badge-status completed">
                <span class="badge-status-dot"></span>
                ${tmpl.status}
              </span>
            </td>
            <td style="font-size:0.8rem; color:var(--text-muted); line-height:1.45; max-width:320px; white-space:normal; overflow:hidden; text-overflow:ellipsis;">
              ${tmpl.body}
            </td>
          </tr>
        `;
      });
      tbody.innerHTML = html;

      // 2. Populate Dropdown Select in Campaign Modal
      const select = document.getElementById('campaign-template-select');
      if (select) {
        select.innerHTML = APPROVED_TEMPLATES.map(tmpl => `<option value="${tmpl.name}">${tmpl.name} (${tmpl.category})</option>`).join('');
        
        // Trigger initial preview selection
        updateTemplatePreview(APPROVED_TEMPLATES[0].name);
      }
    }

    function updateTemplatePreview(templateName) {
      const tmpl = APPROVED_TEMPLATES.find(t => t.name === templateName);
      const container = document.getElementById('template-body-preview-container');
      const bodyPreview = document.getElementById('template-body-preview');
      
      if (tmpl && container && bodyPreview) {
        bodyPreview.textContent = tmpl.body;
        container.style.display = 'block';
      } else if (container) {
        container.style.display = 'none';
      }
    }

    // ----------------------------------------------------
    // TAB 2 ADDITIONS: MULTI-AGENT COLLABORATION & QUICK REPLIES (Option F)
    // ----------------------------------------------------
    const agentStatusSelect = document.getElementById('agent-status-select');
    const agentPresenceDot = document.getElementById('agent-presence-dot');
    const agentPresenceText = document.getElementById('agent-presence-text');
    const chatAssigneeSelect = document.getElementById('chat-assignee-select');
    const slashPopup = document.getElementById('slash-commands-popup');
    const slashList = document.getElementById('slash-commands-list');
    const supportMessageInput = document.getElementById('chat-message-input');
    // State synchronizer for ticket assignment permissions
    let teamMembers = [];

    async function loadTeamMembers() {
      try {
        const members = await apiRequest('/api/workspace/team-members');
        teamMembers = members || [];
        renderTeamMembersInSelect();
      } catch (err) {
        console.error('Failed to load team members:', err);
      }
    }

    function renderTeamMembersInSelect() {
      const select = document.getElementById('chat-assignee-select');
      if (!select) return;
      
      // Keep only the initial options or reset to a clean state
      select.innerHTML = `
        <option value="Unassigned">👤 Unassigned</option>
        <option value="Agent Me">🟢 Agent Me</option>
        <option value="Agent Alice">👩‍💼 Agent Alice</option>
        <option value="Technical Ray">🛠️ Technical Ray</option>
        <option value="CEO Praise">👑 CEO Praise</option>
      `;
      
      teamMembers.forEach(member => {
        const option = document.createElement('option');
        option.value = member.name;
        option.textContent = `👥 ${member.name} (${member.role})`;
        select.appendChild(option);
      });
    }

    // State synchronizer for ticket assignment permissions
    function syncAssigneeSelectState() {
      const lockIcon = document.getElementById('assignee-lock-icon');
      const roleIcon = document.getElementById('role-icon');
      const roleBadge = document.getElementById('role-badge');
      const addMemberBtn = document.getElementById('add-team-member-btn');
      
      if (isTeamLeader) {
        if (roleIcon) roleIcon.textContent = '🛡️';
        if (roleBadge) {
          roleBadge.textContent = 'Team Leader';
          roleBadge.style.background = 'rgba(16,185,129,0.1)';
          roleBadge.style.color = '#047857';
        }
      } else {
        if (roleIcon) roleIcon.textContent = '🔒';
        if (roleBadge) {
          roleBadge.textContent = 'Team Member';
          roleBadge.style.background = '#f1f5f9';
          roleBadge.style.color = '#475569';
        }
      }

      if (chatAssigneeSelect) {
        if (isTeamLeader) {
          chatAssigneeSelect.disabled = false;
          chatAssigneeSelect.style.cursor = 'pointer';
          chatAssigneeSelect.style.background = '#fff';
          chatAssigneeSelect.style.opacity = '1';
          if (lockIcon) {
            lockIcon.textContent = '🔓';
            lockIcon.style.color = '#10b981';
          }
          if (addMemberBtn) {
            addMemberBtn.style.display = 'flex';
          }
        } else {
          chatAssigneeSelect.disabled = true;
          chatAssigneeSelect.style.cursor = 'not-allowed';
          chatAssigneeSelect.style.background = '#f1f5f9';
          chatAssigneeSelect.style.opacity = '0.6';
          if (lockIcon) {
            lockIcon.textContent = '🔒';
            lockIcon.style.color = '#ef4444';
          }
          if (addMemberBtn) {
            addMemberBtn.style.display = 'none';
          }
          const addMemberPopover = document.getElementById('add-team-member-popover');
          if (addMemberPopover) {
            addMemberPopover.style.display = 'none';
          }
        }
      }
    }

    // Initialize standard state
    syncAssigneeSelectState();

    // Add Team Member Form Listeners
    const addTeamMemberBtn = document.getElementById('add-team-member-btn');
    const addTeamMemberPopover = document.getElementById('add-team-member-popover');
    const closeTeamMemberPopover = document.getElementById('close-team-member-popover');
    const submitTeamMemberBtn = document.getElementById('submit-team-member-btn');
    const newMemberNameInput = document.getElementById('new-member-name');
    const newMemberRoleInput = document.getElementById('new-member-role');

    if (addTeamMemberBtn && addTeamMemberPopover) {
      addTeamMemberBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = addTeamMemberPopover.style.display === 'flex';
        addTeamMemberPopover.style.display = isOpen ? 'none' : 'flex';
      });

      if (closeTeamMemberPopover) {
        closeTeamMemberPopover.addEventListener('click', (e) => {
          e.stopPropagation();
          addTeamMemberPopover.style.display = 'none';
        });
      }

      addTeamMemberPopover.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      document.addEventListener('click', () => {
        addTeamMemberPopover.style.display = 'none';
      });
    }

    if (submitTeamMemberBtn) {
      submitTeamMemberBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const name = newMemberNameInput.value.trim();
        const role = newMemberRoleInput.value.trim();

        if (!name) {
          alert('Please enter a team member name.');
          return;
        }

        submitTeamMemberBtn.disabled = true;
        submitTeamMemberBtn.textContent = 'Adding...';

        try {
          const newMember = await apiRequest('/api/workspace/team-members', {
            method: 'POST',
            body: JSON.stringify({ name, role: role || 'Agent' })
          });

          newMemberNameInput.value = '';
          newMemberRoleInput.value = '';
          addTeamMemberPopover.style.display = 'none';

          if (!teamMembers.some(m => m.id === newMember.id)) {
            teamMembers.push(newMember);
            renderTeamMembersInSelect();
          }

          // Automatically select and assign the current active chat to this new member!
          if (activeContactId) {
            const chatAssigneeSelect = document.getElementById('chat-assignee-select');
            if (chatAssigneeSelect) {
              chatAssigneeSelect.value = newMember.name;
              chatAssigneeSelect.dispatchEvent(new Event('change'));
            }
          }
        } catch (err) {
          console.error('Error adding team member:', err);
          alert(err.message || 'Failed to add team member.');
        } finally {
          submitTeamMemberBtn.disabled = false;
          submitTeamMemberBtn.textContent = 'Assign';
        }
      });
    }

    // 1. Agent Presence Status Selector
    agentStatusSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'Online') {
        agentPresenceText.textContent = 'ONLINE';
        agentPresenceText.style.color = '#047857';
        agentPresenceDot.style.background = '#10b981';
      } else if (val === 'Away') {
        agentPresenceText.textContent = 'AWAY';
        agentPresenceText.style.color = '#d97706';
        agentPresenceDot.style.background = '#f59e0b';
      } else if (val === 'Offline') {
        agentPresenceText.textContent = 'OFFLINE';
        agentPresenceText.style.color = '#b91c1c';
        agentPresenceDot.style.background = '#ef4444';
      }
    });

    // 2. Ticket Assignment Selector Change handler
    chatAssigneeSelect.addEventListener('change', async (e) => {
      if (!activeContactId) return;
      const val = e.target.value;
      const agentName = val === 'Unassigned' ? null : val;

      try {
        await apiRequest(`/api/contacts/${activeContactId}/assign`, {
          method: 'POST',
          body: JSON.stringify({ 
            agentName
          })
        });
        
        // Update local state instantly and refresh sidebar
        if (contactsMap[activeContactId]) {
          contactsMap[activeContactId].assignedAgent = agentName;
        }
        loadChatThreads(false);
      } catch (err) {
        alert('Failed to update ticket assignment: Only the Team Leader is authorized to reassign tickets.');
        chatAssigneeSelect.value = contactsMap[activeContactId]?.assignedAgent || 'Unassigned';
      }
    });

    // 3. Bot Handoff Toggle Change handler (Option A)
    const chatBotToggle = document.getElementById('chat-bot-toggle');
    chatBotToggle.addEventListener('change', async (e) => {
      if (!activeContactId) return;
      const botEnabled = e.target.checked;
      const botPausedBanner = document.getElementById('chat-bot-paused-banner');

      try {
        await apiRequest(`/api/contacts/${activeContactId}/bot-toggle`, {
          method: 'POST',
          body: JSON.stringify({ botEnabled })
        });

        // Update local state and banner instantly
        if (contactsMap[activeContactId]) {
          contactsMap[activeContactId].botEnabled = botEnabled;
        }
        if (botPausedBanner) {
          botPausedBanner.style.display = botEnabled ? 'none' : 'inline-block';
        }
        loadChatThreads(false);
      } catch (err) {
        alert('Failed to update bot handoff state.');
        chatBotToggle.checked = contactsMap[activeContactId]?.botEnabled !== false;
      }
    });

    // Canned Canned Replies Dataset
    const CANNED_REPLIES = [
      { shortcut: '/greet', label: '👋 Standard Greeting', text: 'Hello! Thank you for contacting Chatmagal. How can I help you today?' },
      { shortcut: '/hours', label: '🕒 Support Operating Hours', text: '🕒 Our support office hours are Monday to Friday, 9:00 AM - 6:00 PM GMT. Weekends: Closed.' },
      { shortcut: '/pricing', label: '💳 Wallet Pricing Rates', text: '💳 Prepaid message rates: Outbound replies cost $0.05. Inbound is FREE. Marketing broadcasts are $0.05.' },
      { shortcut: '/refund', label: '💸 Credit Refund Policy', text: '💸 Standard Refund Policy: Account credit refills are eligible for full refund within 14 days of purchase if unused.' },
      { shortcut: '/close', label: '✅ Resolve & Close Ticket', text: '✅ This support ticket has been marked as resolved. Thank you for choosing Chatmagal! If you need further assistance, simply reply to this chat.' }
    ];

    // 3. Slash Command Autocomplete Logic
    supportMessageInput.addEventListener('input', (e) => {
      const val = e.target.value;
      if (val.startsWith('/')) {
        renderSlashPopup(val.toLowerCase());
      } else {
        slashPopup.style.display = 'none';
      }
    });

    supportMessageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        slashPopup.style.display = 'none';
      }
    });

    // Close popups on clicking outside
    document.addEventListener('click', (e) => {
      if (e.target !== supportMessageInput && !slashPopup.contains(e.target)) {
        slashPopup.style.display = 'none';
      }
    });

    function renderSlashPopup(query) {
      const filtered = CANNED_REPLIES.filter(r => 
        r.shortcut.startsWith(query) || 
        r.label.toLowerCase().includes(query) || 
        r.text.toLowerCase().includes(query)
      );

      if (filtered.length === 0) {
        slashPopup.style.display = 'none';
        return;
      }

      let html = '';
      filtered.forEach((r) => {
        html += `
          <div class="slash-item" style="padding: 0.75rem 1.25rem; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.15s ease; display: flex; flex-direction: column; gap: 0.15rem; text-align: left;" data-text="${r.text}" onmouseover="this.style.background=\'#f1fdf4\'" onmouseout="this.style.background=\'transparent\'">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong style="color:var(--primary); font-size:0.85rem; font-family:monospace;">${r.shortcut}</strong>
              <span style="font-size:0.75rem; font-weight:700; color:var(--text-muted);">${r.label}</span>
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:340px; margin-top:0.15rem;">${r.text}</div>
          </div>
        `;
      });

      slashList.innerHTML = html;
      slashPopup.style.display = 'block';

      // Bind click triggers
      const items = slashList.querySelectorAll('.slash-item');
      items.forEach(item => {
        item.addEventListener('click', () => {
          supportMessageInput.value = item.getAttribute('data-text');
          slashPopup.style.display = 'none';
          supportMessageInput.focus();
        });
      });
    }

    // ----------------------------------------------------
    /* TAB 5 LOGIC: WHATSAPP SETTINGS & ONBOARDING */
    // ----------------------------------------------------
    function loadSettingsData() {
      if (!currentWorkspace) return;
      
      const workspaceIdDisplay = document.getElementById('settings-display-workspace-id');
      const phoneIdDisplay = document.getElementById('settings-display-phone-id');
      const wabaIdDisplay = document.getElementById('settings-display-waba-id');
      
      const phoneIdInput = document.getElementById('settings-input-phone-id');
      const wabaIdInput = document.getElementById('settings-input-waba-id');
      
      const businessNameInput = document.getElementById('settings-input-business-name');
      const autoDraftToggle = document.getElementById('settings-toggle-auto-draft');
      const systemToneSelect = document.getElementById('settings-select-system-tone');
      const systemPromptInput = document.getElementById('settings-input-system-prompt');
      const bankDetailsInput = document.getElementById('settings-input-bank-details');
      const maskSubscribersToggle = document.getElementById('settings-toggle-mask-subscribers');
      const subscriptionDisplay = document.getElementById('settings-display-subscription');
      
      const googleSpreadsheetIdInput = document.getElementById('settings-input-spreadsheet-id');
      const googleServiceAccountInput = document.getElementById('settings-input-service-account');

      if (workspaceIdDisplay) {
        workspaceIdDisplay.textContent = currentWorkspace.id || workspaceId;
      }
      if (phoneIdDisplay) {
        phoneIdDisplay.textContent = currentWorkspace.metaPhoneNumberId || 'Not Configured';
      }
      if (wabaIdDisplay) {
        wabaIdDisplay.textContent = currentWorkspace.metaWabaId || 'Not Configured';
      }
      
      if (phoneIdInput && !phoneIdInput.value) {
        phoneIdInput.value = currentWorkspace.metaPhoneNumberId || '';
      }
      if (wabaIdInput && !wabaIdInput.value) {
        wabaIdInput.value = currentWorkspace.metaWabaId || '';
      }

      if (subscriptionDisplay) {
        subscriptionDisplay.textContent = currentWorkspace.subscriptionPlan || 'Pro Plan';
      }
      if (businessNameInput) {
        businessNameInput.value = currentWorkspace.businessName || currentWorkspace.name || '';
      }
      if (autoDraftToggle) {
        autoDraftToggle.checked = currentWorkspace.autoDraft !== false;
      }
      if (systemToneSelect) {
        systemToneSelect.value = currentWorkspace.systemTone || 'Friendly & Outgoing (Casual, polite)';
      }
      if (systemPromptInput) {
        systemPromptInput.value = currentWorkspace.systemPrompt || '';
      }
      if (bankDetailsInput) {
        bankDetailsInput.value = currentWorkspace.companyBankDetails || '';
      }
      const flowConfigInput = document.getElementById('settings-input-flow-config');
      if (flowConfigInput) {
        flowConfigInput.value = currentWorkspace.flowConfig ? JSON.stringify(currentWorkspace.flowConfig, null, 2) : '';
      }
      if (maskSubscribersToggle) {
        maskSubscribersToggle.checked = currentWorkspace.maskSubscribers === true;
      }
      if (googleSpreadsheetIdInput) {
        googleSpreadsheetIdInput.value = currentWorkspace.googleSpreadsheetId || '';
      }
      if (googleServiceAccountInput) {
        googleServiceAccountInput.value = currentWorkspace.googleServiceAccountJson || '';
      }
      
      // Load custom AI training rules in background
      loadBotTrainingRules();
    }

    // Save Premium Tenant Settings
    const savePremiumBtn = document.getElementById('settings-save-premium-btn');
    if (savePremiumBtn) {
      savePremiumBtn.addEventListener('click', async () => {
        savePremiumBtn.disabled = true;
        savePremiumBtn.textContent = 'Saving...';
        
        const businessName = document.getElementById('settings-input-business-name').value;
        const autoDraft = document.getElementById('settings-toggle-auto-draft').checked;
        const systemTone = document.getElementById('settings-select-system-tone').value;
        const systemPrompt = document.getElementById('settings-input-system-prompt').value;
        const companyBankDetails = document.getElementById('settings-input-bank-details')?.value || '';
        const maskSubscribers = document.getElementById('settings-toggle-mask-subscribers').checked;
        const googleSpreadsheetId = document.getElementById('settings-input-spreadsheet-id')?.value || '';
        const googleServiceAccountJson = document.getElementById('settings-input-service-account')?.value || '';
        
        let flowConfig = null;
        const flowConfigRaw = document.getElementById('settings-input-flow-config')?.value;
        if (flowConfigRaw && flowConfigRaw.trim()) {
          try {
            flowConfig = JSON.parse(flowConfigRaw);
          } catch (e) {
            alert('Invalid JSON in Chat Flow Builder. Please fix syntax errors before saving.');
            savePremiumBtn.disabled = false;
            savePremiumBtn.textContent = 'Save Configuration';
            return;
          }
        }

        try {
          const response = await apiRequest('/api/workspace/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              businessName,
              autoDraft,
              systemTone,
              systemPrompt,
              companyBankDetails,
              maskSubscribers,
              googleSpreadsheetId,
              googleServiceAccountJson,
              flowConfig
            })
          });

          if (response && response.workspace) {
            currentWorkspace = response.workspace;
            if (activeWorkspacePill) {
              activeWorkspacePill.textContent = `Workspace: ${currentWorkspace.businessName || currentWorkspace.name}`;
            }
            alert('✓ Success! Tenant Settings saved successfully.');
          } else {
            alert('✗ Error: Failed to save settings.');
          }
        } catch (err) {
          console.error('Failed to save settings:', err);
          alert(`✗ Error: ${err.message}`);
        } finally {
          savePremiumBtn.disabled = false;
          savePremiumBtn.textContent = '💾 Save Tenant Settings';
        }
      });
    }

    // Workspace ID Copy Action
    const settingsCopyWorkspaceBtn = document.getElementById('settings-copy-workspace-id-btn');
    if (settingsCopyWorkspaceBtn) {
      settingsCopyWorkspaceBtn.addEventListener('click', () => {
        const idText = document.getElementById('settings-display-workspace-id').textContent;
        navigator.clipboard.writeText(idText)
          .then(() => {
            settingsCopyWorkspaceBtn.textContent = '✓ Copied!';
            setTimeout(() => {
              settingsCopyWorkspaceBtn.textContent = '📋 Copy';
            }, 2000);
          })
          .catch(err => {
            alert('Failed to copy. Workspace ID: ' + idText);
          });
      });
    }

    // Manual Settings Form Submission
    const settingsManualForm = document.getElementById('settings-manual-form');
    const settingsManualBtn = document.getElementById('settings-manual-submit-btn');

    if (settingsManualForm) {
      settingsManualForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const phoneNumberId = document.getElementById('settings-input-phone-id').value.trim();
        const wabaId = document.getElementById('settings-input-waba-id').value.trim();

        if (!phoneNumberId || !wabaId) {
          alert('Please provide both Phone Number ID and WABA ID.');
          return;
        }

        settingsManualBtn.disabled = true;
        settingsManualBtn.textContent = 'Saving Credentials...';

        try {
          const response = await apiRequest('/api/workspace/update-meta', {
            method: 'POST',
            body: JSON.stringify({ phoneNumberId, wabaId })
          });

          if (response.workspace) {
            currentWorkspace = response.workspace;
            alert('✓ Success! WhatsApp API credentials updated successfully.');
            loadSettingsData();
            loadOverviewData();
          } else {
            alert('✗ Error: Failed to update credentials.');
          }
        } catch (err) {
          console.error('Manual settings update failure:', err);
          alert(`✗ Connection failed: ${err.message || 'Verification Error'}`);
        } finally {
          settingsManualBtn.disabled = false;
          settingsManualBtn.textContent = '💾 Save WhatsApp Credentials';
        }
      });
    }

    // Meta Embedded Onboarding Form Submission
    const settingsOnboardForm = document.getElementById('settings-onboard-form');
    const settingsOnboardBtn = document.getElementById('settings-onboard-submit-btn');

    if (settingsOnboardForm) {
      settingsOnboardForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const accessToken = document.getElementById('settings-input-token').value.trim();

        if (!accessToken) {
          alert('Please enter your Meta Access Token.');
          return;
        }

        if (!workspaceId) {
          alert('Session error: No active Workspace ID found.');
          return;
        }

        settingsOnboardBtn.disabled = true;
        settingsOnboardBtn.textContent = 'Resolving WABA Account...';

        try {
          // Send request to onboarding endpoint (POST /api/whatsapp/onboard)
          const response = await apiRequest('/api/whatsapp/onboard', {
            method: 'POST',
            body: JSON.stringify({ accessToken, workspaceId })
          });

          if (response.workspace) {
            currentWorkspace = response.workspace;
            alert('✓ Success! WhatsApp Account onboarded successfully.');
            // Clear token input on success
            document.getElementById('settings-input-token').value = '';
            loadSettingsData();
            loadOverviewData();
          } else {
            alert('✗ Onboarding failed: Check your token permissions.');
          }
        } catch (err) {
          console.error('Onboarding simulation failure:', err);
          alert(`✗ Onboarding failed: ${err.message || 'Verification Error'}`);
        } finally {
          settingsOnboardBtn.disabled = false;
          settingsOnboardBtn.textContent = '🚀 Retrieve and Onboard WABA Account';
        }
      });
    }

    // Production Facebook Embedded Signup Handler
    const settingsFbBtn = document.getElementById('settings-fb-login-btn');
    if (settingsFbBtn) {
      settingsFbBtn.addEventListener('click', () => {
        if (!workspaceId) {
          alert('Session error: No active Workspace ID found.');
          return;
        }

        if (typeof FB === 'undefined') {
          alert('Facebook SDK is not loaded yet. Please wait a moment and try again.');
          return;
        }

        settingsFbBtn.disabled = true;
        const originalHtml = settingsFbBtn.innerHTML;
        settingsFbBtn.innerHTML = 'Connecting with Facebook...';

        const loginOptions = {
          config_id: metaConfigId || '1660089798568100',
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            featureType: 'whatsapp_business_app_onboarding'
          }
        };

        FB.login(function(response) {
          if (response.authResponse) {
            const code = response.authResponse.code;
            onboardWithCode(code);
          } else {
            console.log('User cancelled login or did not fully authorize.');
            alert('✗ Login cancelled or WABA authorization failed.');
            settingsFbBtn.disabled = false;
            settingsFbBtn.innerHTML = originalHtml;
          }
        }, loginOptions);
      });
    }

    async function onboardWithCode(code) {
      const settingsFbBtn = document.getElementById('settings-fb-login-btn');
      if (!settingsFbBtn) return;
      const originalHtml = settingsFbBtn.innerHTML;
      settingsFbBtn.disabled = true;
      settingsFbBtn.innerHTML = 'Retrieving WABA details...';

      try {
        const response = await apiRequest('/api/whatsapp/onboard', {
          method: 'POST',
          body: JSON.stringify({ 
            code, 
            redirectUri: window.location.origin, 
            workspaceId 
          })
        });

        if (response.workspace) {
          currentWorkspace = response.workspace;
          alert('✓ Success! WhatsApp Account onboarded successfully via Meta.');
          loadSettingsData();
          loadOverviewData();
        } else {
          alert('✗ Onboarding failed: ' + (response.error || 'Check your token permissions.'));
        }
      } catch (err) {
        console.error('Onboarding failure:', err);
        alert(`✗ Onboarding failed: ${err.message || 'Verification Error'}`);
      } finally {
        settingsFbBtn.disabled = false;
        settingsFbBtn.innerHTML = originalHtml;
      }
    }
    // ----------------------------------------------------
    /* AI AUTO-RESPONDENT TRAINING & KNOWLEDGE BASE LOGIC */
    // ----------------------------------------------------
    async function loadBotTrainingRules() {
      try {
        const trainings = await apiRequest('/api/workspace/training');
        const tbody = document.getElementById('settings-training-rules-tbody');
        const countSpan = document.getElementById('settings-training-rules-count');
        const container = document.getElementById('settings-training-ledger-container');
        const emptyState = document.getElementById('settings-training-empty-state');
        const clearBtn = document.getElementById('settings-clear-training-btn');

        if (!tbody || !countSpan || !container || !emptyState || !clearBtn) return;

        tbody.innerHTML = '';
        countSpan.textContent = trainings.length;

        if (trainings.length > 0) {
          trainings.forEach(rule => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--border-light)';
            tr.innerHTML = `
              <td style="padding: 0.65rem 1rem; color: #64748b; vertical-align: top; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHTML(rule.category || '-')}</td>
              <td style="padding: 0.65rem 1rem; font-weight: 600; color: var(--text-main); vertical-align: top; word-break: break-word;">${escapeHTML(rule.question)}</td>
              <td style="padding: 0.65rem 1rem; color: #475569; vertical-align: top; word-break: break-word;">${escapeHTML(rule.answer)}</td>
              <td style="padding: 0.65rem 1rem; color: #10b981; font-weight: 600; font-size: 0.72rem; vertical-align: top; word-break: break-word;">${escapeHTML(rule.keywords || '-')}</td>
            `;
            tbody.appendChild(tr);
          });

          container.style.display = 'block';
          emptyState.style.display = 'none';
          clearBtn.style.display = 'inline-flex';
        } else {
          container.style.display = 'none';
          emptyState.style.display = 'block';
          clearBtn.style.display = 'none';
        }
      } catch (err) {
        console.error('Failed to load bot training rules:', err);
      }
    }

    function escapeHTML(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
    }

    // Download Training Template CSV
    const downloadTrainingTemplateBtn = document.getElementById('settings-download-training-template-btn');
    if (downloadTrainingTemplateBtn) {
      downloadTrainingTemplateBtn.addEventListener('click', () => {
        const csvContent = 'data:text/csv;charset=utf-8,' 
          + 'Category,Question,Answer,Keywords\n'
          + '"General","What are your working hours?","Our working hours are Monday to Friday from 9 AM to 6 PM.","hours, time, open, closing"\n'
          + '"Location","Where is your office located?","Our headquarters is located at 123 Tech Avenue, London.","office, address, location, where"\n'
          + '"Billing","Do you offer refunds?","Yes, we offer a 14-day money-back guarantee on all plans.","refund, money back, cancel"\n'
          + '"Pricing","How much does a message cost?","Outbound messages and auto-replies cost $0.05. Inbound is free.","cost, price, rate, charge"\n'
          + '"Support","Can I talk to a human?","Yes, type \\"talk to human\\" or click the Live Handoff switch to pause the bot.","human, agent, real person, help"';
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', 'chatmagal_bot_training_template.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
    }

    // Clear Bot Training Knowledge Base
    const clearTrainingBtn = document.getElementById('settings-clear-training-btn');
    if (clearTrainingBtn) {
      clearTrainingBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to clear your custom AI training knowledge base? This will reset the bot to default instructions.')) return;
        try {
          await apiRequest('/api/workspace/training', { method: 'DELETE' });
          alert('✓ AI Bot training knowledge base cleared successfully!');
          await loadBotTrainingRules();
        } catch (err) {
          alert(`Failed to clear knowledge base: ${err.message}`);
        }
      });
    }

    // Add New Rule Modal Logic
    const addRuleBtn = document.getElementById('settings-add-training-rule-btn');
    const addRuleModal = document.getElementById('add-training-rule-modal');
    const addRuleCancelBtn = document.getElementById('add-rule-cancel-btn');
    const addRuleSaveBtn = document.getElementById('add-rule-save-btn');
    
    if (addRuleBtn && addRuleModal) {
      addRuleBtn.addEventListener('click', () => {
        addRuleModal.style.display = 'flex';
      });

      addRuleCancelBtn.addEventListener('click', () => {
        addRuleModal.style.display = 'none';
        document.getElementById('add-rule-category').value = '';
        document.getElementById('add-rule-question').value = '';
        document.getElementById('add-rule-answer').value = '';
        document.getElementById('add-rule-keywords').value = '';
      });

      addRuleSaveBtn.addEventListener('click', async () => {
        const category = document.getElementById('add-rule-category').value;
        const question = document.getElementById('add-rule-question').value;
        const answer = document.getElementById('add-rule-answer').value;
        const keywords = document.getElementById('add-rule-keywords').value;

        if (!question.trim() || !answer.trim()) {
          alert('Question and Answer are required fields!');
          return;
        }

        addRuleSaveBtn.disabled = true;
        addRuleSaveBtn.textContent = 'Saving...';

        try {
          await apiRequest('/api/workspace/training/single', {
            method: 'POST',
            body: JSON.stringify({ category, question, answer, keywords })
          });
          
          alert('✓ Rule added successfully!');
          addRuleCancelBtn.click(); // Reset and close modal
          await loadBotTrainingRules(); // Refresh table
        } catch (err) {
          alert(`Failed to save rule: ${err.message}`);
        } finally {
          addRuleSaveBtn.disabled = false;
          addRuleSaveBtn.textContent = 'Save Rule';
        }
      });
    }

    // Drag-and-Drop CSV Uploader for Training Q&A
    const trainingUploader = document.getElementById('training-csv-uploader');
    const trainingFileInput = document.getElementById('training-csv-file-input');
    const trainingUploaderTitle = document.getElementById('training-csv-status-title');

    if (trainingUploader && trainingFileInput) {
      trainingUploader.addEventListener('click', () => trainingFileInput.click());
      
      // Highlight drag area
      ['dragenter', 'dragover'].forEach(eventName => {
        trainingUploader.addEventListener(eventName, (e) => {
          e.preventDefault();
          trainingUploader.style.borderColor = 'var(--primary)';
          trainingUploader.style.background = 'rgba(16, 185, 129, 0.02)';
        }, false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        trainingUploader.addEventListener(eventName, (e) => {
          e.preventDefault();
          trainingUploader.style.borderColor = 'var(--border-light)';
          trainingUploader.style.background = 'rgba(15, 23, 42, 0.01)';
        }, false);
      });

      trainingUploader.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
          handleTrainingCSV(files[0]);
        }
      });

      trainingFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          handleTrainingCSV(e.target.files[0]);
        }
      });
    }

    function handleTrainingCSV(file) {
      if (!file.name.endsWith('.csv')) {
        alert('Please upload a valid .csv file!');
        return;
      }

      if (!trainingUploaderTitle) return;

      trainingUploaderTitle.textContent = `Reading ${file.name}...`;
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const text = e.target.result;
          const rules = parseTrainingCSVText(text);
          
          if (rules.length === 0) {
            throw new Error('No valid Q&A rules found in the CSV. Make sure you have "Question" and "Answer" columns.');
          }

          trainingUploaderTitle.textContent = `Uploading ${rules.length} training rules...`;
          
          const response = await apiRequest('/api/workspace/training/upload', {
            method: 'POST',
            body: JSON.stringify({ rules })
          });

          alert(`✓ AI Bot successfully trained with ${rules.length} new Q&A rules!`);
          trainingUploaderTitle.textContent = 'Drag & Drop Training CSV here, or click to browse';
          trainingFileInput.value = '';
          
          await loadBotTrainingRules();
        } catch (err) {
          alert(`Failed to parse/upload training CSV: ${err.message}`);
          trainingUploaderTitle.textContent = 'Drag & Drop Training CSV here, or click to browse';
          trainingFileInput.value = '';
        }
      };
      reader.readAsText(file);
    }

    // Robust CSV Parser supporting quotes and escaped values
    function parseTrainingCSVText(text) {
      const lines = [];
      let row = [""];
      let inQuotes = false;

      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i+1];

        if (c === '"') {
          if (inQuotes && next === '"') {
            row[row.length - 1] += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (c === ',' && !inQuotes) {
          row.push("");
        } else if ((c === '\r' || c === '\n') && !inQuotes) {
          if (c === '\r' && next === '\n') {
            i++;
          }
          if (row.length > 1 || row[0] !== "") {
            lines.push(row);
          }
          row = [""];
        } else {
          row[row.length - 1] += c;
        }
      }
      if (row.length > 1 || row[0] !== "") {
        lines.push(row);
      }

      if (lines.length === 0) return [];

      const headers = lines[0].map(h => h.trim().toLowerCase());
      const qIdx = headers.indexOf('question');
      const aIdx = headers.indexOf('answer');

      const cIdx = headers.indexOf('category');
      const kIdx = headers.indexOf('keywords');

      if (qIdx === -1 || aIdx === -1) {
        throw new Error('CSV headers must include at least "Question" and "Answer" columns.');
      }

      const rules = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const question = line[qIdx];
        const answer = line[aIdx];
        const category = cIdx !== -1 ? line[cIdx] : null;
        const keywords = kIdx !== -1 ? line[kIdx] : null;
        
        if (question && answer && question.trim() && answer.trim()) {
          rules.push({
            category: category ? category.trim() : null,
            question: question.trim(),
            answer: answer.trim(),
            keywords: keywords ? keywords.trim() : null
          });
        }
      }
      return rules;
    }



  