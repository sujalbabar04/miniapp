// --- App State and Global Variables ---
let currentTab = 'home';
let navigationHistory = [];
let currentUserProfile = null; // This will hold the user's data from Supabase
let allTournaments = []; // Cache for all fetched tournaments

// --- Supabase Configuration ---
// IMPORTANT: Replace these with your actual Supabase project URL and anon key
const SUPABASE_URL = 'https://ltyznmqlfcqqktsvkpyr.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0eXpubXFsZmNxcWt0c3ZrcHlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwNDc5ODMsImV4cCI6MjA3MjYyMzk4M30.RLHE8-862S3TCSYkldMVgXDGHd6Dsa2bskPm2DH69sU';

// Initialize Supabase client
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
    showToast('Supabase not configured. Please update script.js', 'error');
    console.error("Please configure your Supabase URL and Anon Key in script.js");
  }

  initializeAppUI();
  await handleUserSession();
  await loadTournaments(); // Load tournaments from Supabase
  createToastContainer();
});

function initializeAppUI() {
  // Setup navigation, filters, and other static UI elements
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        filterTournaments(tab.dataset.filter);
    });
  });
  document.querySelectorAll('.my-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        document.querySelectorAll('.my-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        loadMyTournaments(e.target.dataset.tab);
    });
  });
}

// --- Supabase User & Profile Management ---
async function handleUserSession() {
  const tg = window.Telegram?.WebApp;
  const telegramUser = tg?.initDataUnsafe?.user || { id: 123456789, first_name: 'Test User' };
  
  if (!telegramUser?.id) {
    showToast("Could not identify Telegram user.", 'error');
    return;
  }

  const email = `${telegramUser.id}@telegram.user`;
  const password = `tg_user_secret_${telegramUser.id}`;

  try {
    let { data: sessionData, error: signInError } = await db.auth.signInWithPassword({ email, password });

    if (signInError) {
      if (signInError.message.includes('Invalid login credentials')) {
        let { data: signUpData, error: signUpError } = await db.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        sessionData = signUpData;
      } else {
        throw signInError;
      }
    }

    if (!sessionData?.user) {
        showToast('Authentication failed. Please restart the app.', 'error');
        return;
    }

    const profile = await fetchUserProfile(sessionData.user.id);

    if (profile) {
      currentUserProfile = profile;
      updateUIWithUserData();
    } else {
      document.getElementById('displayName').value = telegramUser.first_name || '';
      showModal('profileSetupModal');
    }

  } catch (error) {
    console.error('Authentication or Profile Fetch Error:', error.message);
    showToast('Error loading your session.', 'error');
  }
}


async function fetchUserProfile(userId) {
  try {
    const { data, error } = await db.from('profiles').select('*').eq('user_id', userId).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  } catch (error) {
    console.error('Error fetching profile:', error.message);
    return null;
  }
}

async function completeProfile() {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return showToast('You are not logged in.', 'error');

    const displayName = document.getElementById('displayName').value;
    const gameId = document.getElementById('gameId').value;
    const phoneNumber = document.getElementById('phoneNumber').value;
    const preferredGame = document.getElementById('preferredGame').value;

    if (!displayName || !gameId || !phoneNumber) return showToast('Please fill out all required fields.', 'warning');
    
    const profileData = {
        user_id: user.id,
        display_name: displayName,
        game_id: gameId,
        phone_number: phoneNumber,
        preferred_game: preferredGame,
        telegram_user_id: user.email.split('@')[0] 
    };

    try {
        const { data, error } = await db.from('profiles').upsert(profileData).select().single();
        if (error) throw error;
        
        currentUserProfile = data;
        updateUIWithUserData();
        closeModal('profileSetupModal');
        showToast('Profile Saved!', 'success');
    } catch (error) {
        console.error('Error saving profile:', error.message);
        showToast('Failed to save profile.', 'error');
    }
}

function updateUIWithUserData() {
  if (!currentUserProfile) return;
  document.getElementById('userName').textContent = currentUserProfile.display_name;
  document.getElementById('userBalance').textContent = `₹${currentUserProfile.balance}`;
  document.getElementById('walletBalance').textContent = `₹${currentUserProfile.balance}`;
  document.getElementById('bonusBalance').textContent = `₹${currentUserProfile.bonus_balance}`;
  document.getElementById('referralEarnings').textContent = `₹${currentUserProfile.referral_earnings}`;
  document.getElementById('totalGames').textContent = currentUserProfile.total_games;
  document.getElementById('totalWins').textContent = currentUserProfile.total_wins;
  document.getElementById('totalEarnings').textContent = `₹${currentUserProfile.total_earnings}`;
  document.getElementById('userLevel').textContent = currentUserProfile.level;
  document.getElementById('profileName').textContent = currentUserProfile.display_name;
}

// --- Data Fetching & Display ---
async function loadTournaments() {
    try {
        const { data, error } = await db.from('tournaments').select(`*, participants:tournament_participants(count)`).order('start_time', { ascending: true });
        if (error) throw error;
        allTournaments = data;
        displayTournaments(allTournaments);
        displayFeaturedTournaments(allTournaments.slice(0, 3));
    } catch(error) {
        console.error('Error loading tournaments:', error.message);
        showToast('Could not load tournaments.', 'error');
    }
}

async function loadMyTournaments(status = 'upcoming') {
    const listId = `${status}Tournaments`;
    const container = document.getElementById(listId);
    container.innerHTML = '<div>Loading your tournaments...</div>';

    try {
        const { data: { user } } = await db.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        const { data: participations, error: participationError } = await db
            .from('tournament_participants')
            .select('tournament_id')
            .eq('user_id', user.id);
        
        if (participationError) throw participationError;
        
        const tournamentIds = participations.map(p => p.tournament_id);
        if (tournamentIds.length === 0) {
            container.innerHTML = `<div>You have no ${status} tournaments.</div>`;
            return;
        }
        
        const statusMap = {
            upcoming: 'open',
            live: 'live',
            completed: 'completed'
        };

        const { data: myTournaments, error: tournamentsError } = await db
            .from('tournaments')
            .select('*')
            .in('id', tournamentIds)
            .eq('status', statusMap[status]);

        if (tournamentsError) throw tournamentsError;
        
        if (myTournaments.length === 0) {
             container.innerHTML = `<div>You have no ${status} tournaments.</div>`;
        } else {
            displayMyTournaments(myTournaments, listId);
        }

    } catch (error) {
        console.error(`Error loading my ${status} tournaments:`, error.message);
        container.innerHTML = `<div>Could not load tournaments.</div>`;
    }
}

function displayTournaments(tournaments) {
    const grid = document.getElementById('tournamentGrid');
    if (tournaments.length === 0) {
        grid.innerHTML = '<p>No tournaments available right now. Check back soon!</p>';
        return;
    }
    grid.innerHTML = tournaments.map(t => {
        const filledSlots = t.participants[0]?.count || 0;
        const filledPercentage = t.total_slots > 0 ? (filledSlots / t.total_slots) * 100 : 0;
        return `
        <div class="tournament-card" onclick="showTournamentDetails(${t.id})">
            <div class="tournament-header">
                <div class="tournament-game">${t.game.toUpperCase()}</div>
                <div class="tournament-status ${t.status}">${t.status}</div>
            </div>
            <div class="tournament-name">${t.name}</div>
            <div class="tournament-info">
                <div class="info-item"><span class="label">Entry</span><span class="value">₹${t.entry_fee}</span></div>
                <div class="info-item"><span class="label">Prize</span><span class="value">₹${t.prize_pool}</span></div>
                <div class="info-item"><span class="label">Slots</span><span class="value">${filledSlots}/${t.total_slots}</span></div>
            </div>
            <div class="tournament-time">🕒 ${new Date(t.start_time).toLocaleString()}</div>
            <div class="progress-bar"><div class="progress-fill" style="width: ${filledPercentage}%"></div></div>
        </div>
    `}).join('');
}

function displayMyTournaments(tournaments, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = tournaments.map(t => `
        <div class="my-tournament-card">
            <h4>${t.name}</h4>
            <p><strong>Game:</strong> ${t.game.toUpperCase()}</p>
            <p><strong>Starts:</strong> ${new Date(t.start_time).toLocaleString()}</p>
        </div>
    `).join('');
}


function displayFeaturedTournaments(tournaments) {
    const featured = document.getElementById('featuredTournaments');
    featured.innerHTML = tournaments.map(t => `
        <div class="featured-item" onclick="showTournamentDetails(${t.id})">
            <div class="featured-info">
                <div class="featured-name">${t.name}</div>
                <div class="featured-details">₹${t.entry_fee} Entry • ₹${t.prize_pool} Prize</div>
            </div>
            <button class="featured-btn">Join</button>
        </div>
    `).join('');
}


// --- Core App Logic (Actions) ---
async function showTournamentDetails(tournamentId) {
    const tournament = allTournaments.find(t => t.id === tournamentId);
    if (!tournament) return showToast('Tournament not found.', 'error');
    
    const detailsContainer = document.getElementById('tournamentDetails');
    detailsContainer.innerHTML = `
        <h3>${tournament.name}</h3>
        <p><strong>Game:</strong> ${tournament.game.toUpperCase()}</p>
        <p><strong>Entry Fee:</strong> ₹${tournament.entry_fee}</p>
        <p><strong>Prize Pool:</strong> ₹${tournament.prize_pool}</p>
        <p><strong>Starts:</strong> ${new Date(tournament.start_time).toLocaleString()}</p>
    `;
    
    const joinBtn = document.querySelector('#joinModal .btn-primary');
    joinBtn.onclick = () => confirmJoinTournament(tournament);

    showModal('joinModal');
}

async function confirmJoinTournament(tournament) {
    if (!currentUserProfile) return showToast('Please complete your profile first.', 'warning');
    if (currentUserProfile.balance < tournament.entry_fee) return showToast('Insufficient balance to join.', 'error');

    try {
        const { data: { user } } = await db.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        const newBalance = currentUserProfile.balance - tournament.entry_fee;

        const { error } = await db.rpc('join_tournament', {
            p_user_id: user.id,
            p_tournament_id: tournament.id,
            p_entry_fee: tournament.entry_fee,
            p_new_balance: newBalance,
            p_description: `Entry for ${tournament.name}`
        });

        if (error) throw error;
        
        currentUserProfile.balance = newBalance;
        updateUIWithUserData();
        loadTournaments(); // Refresh tournament list to show updated slot counts
        closeModal('joinModal');
        showToast(`Successfully joined ${tournament.name}!`, 'success');

    } catch (error) {
        console.error('Error joining tournament:', error.message);
        if (error.message.includes('unique constraint')) {
            showToast('You have already joined this tournament.', 'warning');
        } else {
            showToast('Failed to join tournament.', 'error');
        }
    }
}


// --- Navigation and UI State Management ---
function switchTab(tabName, addToHistory = true) {
  document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
  document.getElementById(tabName)?.classList.add('active');
  document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
  document.querySelector(`.nav-tab[data-tab="${tabName}"]`)?.classList.add('active');

  if (tabName === 'my-tournaments') {
    loadMyTournaments('upcoming');
  }

  const backBtn = document.getElementById('backBtn');
  if (addToHistory && currentTab !== tabName) {
    navigationHistory.push(currentTab);
  }
  backBtn.style.display = navigationHistory.length > 0 ? 'block' : 'none';
  currentTab = tabName;
  updateHeaderTitle(tabName);
}

function goBack() {
  if (navigationHistory.length > 0) {
    const previousTab = navigationHistory.pop();
    switchTab(previousTab, false);
  }
}

function updateHeaderTitle(tabName) {
  const titles = {
    'home': '🏆 OTO Tournament', 'tournaments': '🎮 Tournaments', 'my-tournaments': '📋 My Games',
    'wallet': '💰 Wallet', 'store': '🛒 Store', 'more': '⋯ More', 'leaderboard': '🏅 Leaderboard'
  };
  document.getElementById('headerTitle').textContent = titles[tabName] || '🏆 OTO Tournament';
}

// --- Modal Functions & Action Handlers ---
function showModal(modalId) { document.getElementById(modalId).style.display = 'flex'; }
function closeModal(modalId) { document.getElementById(modalId).style.display = 'none'; }
function showDepositModal() { showModal('depositModal'); }
function showWithdrawModal() {
  document.getElementById('availableWithdraw').textContent = `₹${currentUserProfile?.balance || 0}`;
  showModal('withdrawModal');
}
function showSupport() { showModal('supportModal'); }
function showFilters() { showModal('filterModal'); }
function showProfileModal() { showModal('profileSetupModal'); }
function createTicket() {
  closeModal('supportModal');
  showModal('ticketModal');
}

function selectAmount(amount, event) {
  document.getElementById('depositAmount').value = amount;
  document.querySelectorAll('.amount-btn').forEach(btn => btn.classList.remove('selected'));
  event?.target.classList.add('selected');
}

async function processDeposit() {
    const amount = parseFloat(document.getElementById('depositAmount').value);
    if (!amount || amount <= 0) return showToast('Please enter a valid amount.', 'warning');
    if (!currentUserProfile) return showToast('Please log in first.', 'error');

    try {
        const { data: { user } } = await db.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        const newBalance = currentUserProfile.balance + amount;

        await db.from('wallet_transactions').insert({
            user_id: user.id,
            transaction_type: 'deposit',
            amount: amount,
            description: 'User deposit'
        });

        const { data: updatedProfile } = await db.from('profiles').update({ balance: newBalance }).eq('user_id', user.id).select().single();

        currentUserProfile = updatedProfile;
        updateUIWithUserData();
        closeModal('depositModal');
        showToast(`₹${amount} added to your wallet!`, 'success');
    } catch (error) {
        console.error('Error processing deposit:', error.message);
        showToast('Deposit failed.', 'error');
    }
}

async function processWithdraw() {
    const amount = parseFloat(document.getElementById('withdrawAmount').value);
    const upi = document.getElementById('upiId').value;

    if (!amount || amount < 100 || !upi) return showToast('Please fill all fields correctly.', 'warning');
    if (amount > currentUserProfile.balance) return showToast('Insufficient balance.', 'error');

    try {
        const { data: { user } } = await db.auth.getUser();
        if (!user) throw new Error("User not authenticated.");
        
        // In a real app, this would trigger a backend process. Here, we just log it.
        await db.from('wallet_transactions').insert({
            user_id: user.id,
            transaction_type: 'withdrawal',
            amount: -amount,
            status: 'pending',
            description: `Withdrawal to ${upi}`
        });

        showToast('Withdrawal request submitted!', 'success');
        closeModal('withdrawModal');
    } catch (error) {
        console.error('Error processing withdrawal:', error.message);
        showToast('Withdrawal failed.', 'error');
    }
}

async function submitTicket() {
    const subject = document.getElementById('ticketSubject').value;
    const description = document.getElementById('ticketDescription').value;
    const priority = document.getElementById('ticketPriority').value;
    
    if (!subject || !description) return showToast('Please fill out all ticket fields.', 'warning');
    
    try {
        const { data: { user } } = await db.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        await db.from('support_tickets').insert({
            user_id: user.id,
            subject,
            description,
            priority
        });

        showToast('Support ticket created!', 'success');
        closeModal('ticketModal');
    } catch (error) {
        console.error('Error submitting ticket:', error.message);
        showToast('Could not submit ticket.', 'error');
    }
}


function filterTournaments(filter) {
    if (filter === 'all') {
        displayTournaments(allTournaments);
    } else {
        const filtered = allTournaments.filter(t => t.game === filter);
        displayTournaments(filtered);
    }
}

function showQuickJoin() { switchTab('tournaments'); }

// --- More Section Handlers ---
function showLeaderboard() { switchTab('leaderboard'); }
function showProfileSettings() { showModal('profileSetupModal'); }
function showGameSettings() { showToast("Game Settings clicked"); }
function showReferral() { showToast("Refer & Earn clicked"); }
function showFAQ() { showToast("FAQ clicked"); }
function showTerms() { showToast("Terms clicked"); }
function showNotifications() { showToast("Notifications clicked"); }
function rateApp() { showToast("Rate App clicked"); }
function openChat() { closeModal('supportModal'); showToast("Opening Live Chat..."); }
function callSupport() { showToast("Calling support..."); }
function emailSupport() { showToast("Opening email client..."); }
function showAllTransactions() { showToast("Viewing all transactions..."); }
function showBonusModal() { showToast(`Bonus Balance: ₹${currentUserProfile?.bonus_balance || 0}`); }
function showReferralModal() { showToast(`Referral Earnings: ₹${currentUserProfile?.referral_earnings || 0}`); }
function clearFilters() {
  document.querySelectorAll('#filterModal input[type="checkbox"]').forEach(input => {
    input.checked = false;
  });
  showToast("Filters cleared.");
}
function applyFilters() {
  closeModal('filterModal');
  showToast("Filters applied.");
}


// --- Toast Notification System ---
function createToastContainer() {
  if (!document.getElementById('toast-container')) {
    const container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
}

function showToast(message, type = 'info') { // type can be 'info', 'success', 'warning', 'error'
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  toast.addEventListener('animationend', (e) => {
    if (e.animationName === 'toast-out') toast.remove();
  });
}

// --- Telegram WebApp Integration ---
if (window.Telegram && window.Telegram.WebApp) {
  const tg = window.Telegram.WebApp;
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#667eea');
  tg.setBackgroundColor('#f7fafc');
  tg.BackButton.onClick(goBack);
  setInterval(() => {
    if (navigationHistory.length > 0 && !tg.BackButton.isVisible) {
      tg.BackButton.show();
    } else if (navigationHistory.length === 0 && tg.BackButton.isVisible) {
      tg.BackButton.hide();
    }
  }, 100);
}
