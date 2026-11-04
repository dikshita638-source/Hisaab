/*
 * HISAAB — app.js
 * UI rendering, view navigation, modal forms and event wiring.
 */
(function () {
  'use strict';

  var Core = window.HisaabCore;
  var Store = window.HisaabStore;
  var ME = Store.ME;
  var EPS = Core.EPSILON;
  var TONES = ['lemon', 'lavender', 'mint', 'cyan'];

  var CURRENCY_NAMES = {
    INR: 'Indian Rupee',
    USD: 'US Dollar',
    EUR: 'Euro',
    GBP: 'British Pound'
  };

  var VIEW_META = {
    dashboard: {
      kicker: 'OVERVIEW',
      title: 'Good evening!',
      subtitle: "Here's what's happening with your shared expenses.",
      placeholder: 'Search groups, expenses...'
    },
    groups: {
      kicker: 'GROUPS',
      title: 'Your groups',
      subtitle: 'Every trip, flat and team lunch in one place.',
      placeholder: 'Search your groups...'
    },
    expenses: {
      kicker: 'LEDGER',
      title: 'All expenses',
      subtitle: 'Search, edit and keep every shared cost in order.',
      placeholder: 'Search expenses...'
    },
    settlements: {
      kicker: 'SETTLE UP',
      title: 'Fewer payments, all square.',
      subtitle: 'HISAAB finds the shortest path to settle every group.',
      placeholder: 'Search settlements...'
    },
    settings: {
      kicker: 'SETTINGS',
      title: 'Make HISAAB yours.',
      subtitle: 'Profile, currency and the data stored in this browser.',
      placeholder: 'Search HISAAB...'
    }
  };

  var ui = {
    view: 'dashboard',
    activeGroupId: null,
    search: '',
    expenseGroupFilter: 'all',
    settlementGroupFilter: 'all',
    calendar: { year: 0, month: 0, selected: '' }
  };

  var els = {};

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                      */
  /* ------------------------------------------------------------------ */

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function esc(value) {
    return Core.escapeHtml(value);
  }

  function icon(name, extraClass) {
    return '<svg class="icon ' + (extraClass || '') + '" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
  }

  function currentState() {
    return Store.getState();
  }

  function money(amount) {
    return Core.formatMoney(amount, currentState().profile.currency);
  }

  function currencySymbol() {
    return Core.getCurrency(currentState().profile.currency).symbol;
  }

  function toneFor(seed) {
    var text = String(seed || '');
    var hash = 0;
    for (var i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    }
    return TONES[hash % TONES.length];
  }

  function groupMonogram(name) {
    var words = String(name || '').trim().split(/\s+/).filter(function (word) {
      return word && !/^\d+$/.test(word);
    });
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    var compact = String(name || '').replace(/[^a-z0-9]/gi, '');
    return (compact.slice(0, 2) || 'GR').toUpperCase();
  }

  function avatarHTML(name, id, sizeClass) {
    var classes = 'avatar ' + (sizeClass || '');
    if (id === ME) {
      classes += ' avatar-me';
    } else {
      classes += ' tone-' + toneFor(id || name);
    }
    return '<span class="' + classes.replace(/\s+/g, ' ').trim() + '" aria-hidden="true">' + esc(Core.initials(name)) + '</span>';
  }

  function memberName(group, id) {
    var member = group && group.members.find(function (item) { return item.id === id; });
    return member ? member.name : 'Unknown';
  }

  function findMember(group, id) {
    return group && group.members.find(function (member) { return member.id === id; });
  }

  function getNet(group) {
    var state = currentState();
    return Core.calculateGroupNet(group, state.expenses, state.settlements);
  }

  function balanceInfo(amount, perspective) {
    var rounded = Core.roundMoney(amount);
    var informal = perspective === 'group';

    if (rounded > EPS) {
      return { cls: 'is-positive', text: (informal ? "You're owed " : 'Gets ') + money(rounded) };
    }
    if (rounded < -EPS) {
      return { cls: 'is-negative', text: (informal ? 'You owe ' : 'Owes ') + money(-rounded) };
    }
    return { cls: 'is-settled', text: 'Settled up' };
  }

  function yourBalanceText(amount) {
    var rounded = Core.roundMoney(amount);
    if (rounded > EPS) return "You're owed " + money(rounded);
    if (rounded < -EPS) return 'You owe ' + money(-rounded);
    return 'All settled';
  }

  function yourBalanceClass(amount) {
    var rounded = Core.roundMoney(amount);
    if (rounded > EPS) return 'is-positive';
    if (rounded < -EPS) return 'is-negative';
    return 'is-settled';
  }

  function sortedExpenses(expenses) {
    return expenses.slice().sort(function (a, b) {
      var byDate = String(b.date).localeCompare(String(a.date));
      if (byDate !== 0) return byDate;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
  }

  function uniquePeopleCount(groups) {
    var names = {};
    groups.forEach(function (group) {
      group.members.forEach(function (member) {
        names[member.name.toLowerCase()] = true;
      });
    });
    return Object.keys(names).length;
  }

  function groupMatchesSearch(group, query) {
    if (!query) return true;
    if (group.name.toLowerCase().indexOf(query) !== -1) return true;
    return group.members.some(function (member) {
      return member.name.toLowerCase().indexOf(query) !== -1;
    });
  }

  function expenseMatchesSearch(expense, query) {
    if (!query) return true;
    var group = Store.getGroup(expense.groupId);
    if (!group) return false;
    if (String(expense.description).toLowerCase().indexOf(query) !== -1) return true;
    if (group.name.toLowerCase().indexOf(query) !== -1) return true;
    return memberName(group, expense.paidBy).toLowerCase().indexOf(query) !== -1;
  }

  function getPendingForMe() {
    var state = currentState();
    var pending = [];

    state.groups.forEach(function (group) {
      var net = Core.calculateGroupNet(group, state.expenses, state.settlements);
      Core.minimizeSettlements(net).forEach(function (payment) {
        if (payment.from === ME || payment.to === ME) {
          pending.push({
            group: group,
            from: payment.from,
            to: payment.to,
            amount: payment.amount,
            fromName: memberName(group, payment.from),
            toName: memberName(group, payment.to)
          });
        }
      });
    });

    return pending.sort(function (a, b) { return b.amount - a.amount; });
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024) return bytes + ' B';
    return (bytes / 1024).toFixed(1) + ' KB';
  }

  /* ------------------------------------------------------------------ */
  /* Header, navigation, profile                                        */
  /* ------------------------------------------------------------------ */

  function greetingForNow() {
    var hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function renderHeader() {
    var meta = VIEW_META[ui.view] || VIEW_META.dashboard;
    var title = meta.title;
    var subtitle = meta.subtitle;
    var kicker = meta.kicker;

    if (ui.view === 'dashboard') {
      title = greetingForNow() + ', ' + currentState().profile.name + '!';
    }

    if (ui.view === 'group') {
      var group = Store.getGroup(ui.activeGroupId);
      if (group) {
        var groupExpenses = Store.getGroupExpenses(group.id);
        title = group.name;
        subtitle = group.members.length + ' members · ' + groupExpenses.length +
          ' expense' + (groupExpenses.length === 1 ? '' : 's') +
          ' · Created ' + Core.formatDate(String(group.createdAt).slice(0, 10));
        kicker = 'GROUP DETAILS';
      }
    }

    if (els.pageTitle) els.pageTitle.textContent = title;
    if (els.pageSubtitle) els.pageSubtitle.textContent = subtitle;
    if (els.pageKicker) els.pageKicker.textContent = kicker;
    if (els.search) {
      els.search.placeholder = meta.placeholder || 'Search HISAAB...';
      els.search.disabled = ui.view === 'settings';
    }
  }

  function renderProfile() {
    var profile = currentState().profile;
    var initials = Core.initials(profile.name);
    var currency = Core.getCurrency(profile.currency);
    var currencyLabel = (CURRENCY_NAMES[profile.currency] || 'Currency') + ' · ' + currency.symbol;

    if (els.profileAvatar) els.profileAvatar.textContent = initials;
    if (els.profileName) els.profileName.textContent = profile.name;
    if (els.dropdownAvatar) els.dropdownAvatar.textContent = initials;
    if (els.dropdownName) els.dropdownName.textContent = profile.name;
    if (els.dropdownCurrency) els.dropdownCurrency.textContent = currencyLabel;
  }

  function renderNavigation() {
    var activeView = ui.view === 'group' ? 'groups' : ui.view;
    $$('.nav-item[data-nav], .mobile-nav [data-nav]').forEach(function (item) {
      var isActive = item.getAttribute('data-nav') === activeView;
      item.classList.toggle('is-active', isActive);
      if (isActive) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
  }

  function renderNotifications() {
    var pending = getPendingForMe();
    if (els.bellDot) els.bellDot.hidden = pending.length === 0;
    if (els.bellCount) els.bellCount.textContent = String(pending.length);
    if (!els.bellDropdownBody) return;

    if (!pending.length) {
      els.bellDropdownBody.innerHTML = '<div class="dropdown-empty">' +
        (currentState().groups.length
          ? '<strong>You are all settled up.</strong><br>No payments are waiting on you.'
          : 'No pending settlements yet.<br>Create a group to get started.') +
        '</div>';
      return;
    }

    els.bellDropdownBody.innerHTML = pending.slice(0, 3).map(function (item) {
      var copy = item.from === ME ? 'You pay ' + esc(item.toName) : esc(item.fromName) + ' pays you';
      return '<button class="notif-item" type="button" data-action="record-settlement"' +
        ' data-group-id="' + esc(item.group.id) + '"' +
        ' data-from="' + esc(item.from) + '"' +
        ' data-to="' + esc(item.to) + '"' +
        ' data-amount="' + esc(item.amount) + '">' +
        avatarHTML(item.fromName, item.from, 'small') +
        '<span class="notif-copy"><strong>' + copy + '</strong>' +
        '<span>' + esc(item.group.name) + '</span></span>' +
        '<span class="notif-amount">' + money(item.amount) + '</span>' +
        '</button>';
    }).join('');
  }

  /* ------------------------------------------------------------------ */
  /* Dashboard                                                          */
  /* ------------------------------------------------------------------ */

  function statCardHTML(label, value, foot, tone, iconName) {
    return '<article class="stat-card ' + tone + '">' +
      '<div class="stat-top">' +
        '<span class="stat-label">' + esc(label) + '</span>' +
        '<span class="stat-icon">' + icon(iconName) + '</span>' +
      '</div>' +
      '<div class="stat-value">' + value + '</div>' +
      '<div class="stat-foot">' + icon('spark') + '<span>' + esc(foot) + '</span></div>' +
      '</article>';
  }

  function groupCardHTML(group) {
    var net = getNet(group);
    var meNet = net[ME] || 0;
    var groupExpenses = Store.getGroupExpenses(group.id);
    var total = groupExpenses.reduce(function (sum, expense) { return sum + Number(expense.amount); }, 0);
    var balance = balanceInfo(meNet, 'group');
    var shown = group.members.slice(0, 4);
    var more = group.members.length - shown.length;

    var avatars = shown.map(function (member) {
      return avatarHTML(member.name, member.id, 'tiny');
    }).join('');
    if (more > 0) avatars += '<span class="avatar-stack-more">+' + more + '</span>';

    return '<article class="group-card" data-open-group="' + esc(group.id) + '" tabindex="0" role="button" aria-label="Open ' + esc(group.name) + '">' +
      '<div class="group-card-head">' +
        '<span class="group-mark tone-' + toneFor(group.id) + '">' + esc(groupMonogram(group.name)) + '</span>' +
        '<div class="group-card-copy">' +
          '<h3>' + esc(group.name) + '</h3>' +
          '<p>' + group.members.length + ' member' + (group.members.length === 1 ? '' : 's') + '</p>' +
        '</div>' +
        '<span class="group-arrow">' + icon('arrow-right') + '</span>' +
      '</div>' +
      '<div class="group-card-middle">' +
        '<div class="avatar-stack">' + avatars + '</div>' +
        '<span class="tag ' + toneFor(group.id) + '">' + groupExpenses.length + ' expense' + (groupExpenses.length === 1 ? '' : 's') + '</span>' +
      '</div>' +
      '<div class="group-card-meta">' +
        '<div><span class="meta-label">Total expenses</span><span class="meta-value">' + money(total) + '</span></div>' +
        '<div><span class="meta-label">Your balance</span><span class="balance-tag ' + balance.cls + '">' + balance.text + '</span></div>' +
      '</div>' +
      '</article>';
  }

  function activityRowHTML(expense) {
    var group = Store.getGroup(expense.groupId);
    if (!group) return '';
    var payer = memberName(group, expense.paidBy);

    return '<button class="activity-row" type="button" data-open-group="' + esc(group.id) + '">' +
      '<span class="activity-icon tone-' + toneFor(group.id) + '">' + icon('receipt') + '</span>' +
      '<span class="activity-copy">' +
        '<span class="activity-title">' + esc(expense.description) + '</span>' +
        '<span>' + esc(group.name) + ' · Paid by ' + esc(payer) + (expense.paidBy === ME ? ' (you)' : '') + '</span>' +
      '</span>' +
      '<span class="activity-meta">' +
        '<span class="activity-amount">' + money(expense.amount) + '</span>' +
        '<span class="activity-date">' + Core.formatRelativeDate(expense.date) + '</span>' +
      '</span>' +
      '</button>';
  }

  function emptyStateHTML(options) {
    return '<div class="empty-state' + (options.compact ? ' compact' : '') + '">' +
      '<span class="empty-icon">' + icon(options.icon || 'spark') + '</span>' +
      '<h3>' + esc(options.title) + '</h3>' +
      '<p>' + esc(options.text) + '</p>' +
      (options.actions ? '<div class="empty-actions">' + options.actions + '</div>' : '') +
      '</div>';
  }

  function renderDashboard() {
    var state = currentState();
    var groups = state.groups;
    var totalExpenses = state.expenses.reduce(function (sum, expense) { return sum + Number(expense.amount); }, 0);
    var youOwe = 0;
    var youOwed = 0;
    var oweGroups = 0;
    var owedGroups = 0;

    groups.forEach(function (group) {
      var myBalance = getNet(group)[ME] || 0;
      if (myBalance < -EPS) {
        youOwe += -myBalance;
        oweGroups += 1;
      } else if (myBalance > EPS) {
        youOwed += myBalance;
        owedGroups += 1;
      }
    });

    var query = ui.search.toLowerCase();
    var filteredGroups = groups.filter(function (group) { return groupMatchesSearch(group, query); });
    var recent = sortedExpenses(state.expenses).filter(function (expense) {
      return expenseMatchesSearch(expense, query);
    }).slice(0, 6);
    var people = uniquePeopleCount(groups);

    var totalFoot = state.expenses.length
      ? state.expenses.length + ' expenses across ' + groups.length + ' group' + (groups.length === 1 ? '' : 's')
      : 'No expenses logged yet';
    var oweFoot = oweGroups
      ? 'Across ' + oweGroups + ' group' + (oweGroups === 1 ? '' : 's') + ' to settle'
      : 'Nothing waiting to be paid';
    var owedFoot = owedGroups
      ? 'From ' + owedGroups + ' group' + (owedGroups === 1 ? '' : 's') + ' that owe you'
      : 'Nothing waiting to be collected';
    var groupsFoot = groups.length
      ? people + ' people in your circle'
      : 'Create your first group to begin';

    var stats = '<section class="stats-grid" aria-label="Expense summary">' +
      statCardHTML('Total group expenses', money(totalExpenses), totalFoot, 'lemon', 'wallet') +
      statCardHTML('You owe', money(youOwe), oweFoot, 'lavender', 'arrow-up-right') +
      statCardHTML('You are owed', money(youOwed), owedFoot, 'mint', 'settle') +
      statCardHTML('Active groups', String(groups.length), groupsFoot, 'cyan', 'users') +
      '</section>';

    var groupsBody;
    if (!groups.length) {
      groupsBody = emptyStateHTML({
        icon: 'users',
        title: 'No groups yet',
        text: 'Create a group for your trip, flat or team lunch. HISAAB will keep every shared rupee in order.',
        actions:
          '<button class="btn btn-primary btn-small" type="button" data-action="new-group">' + icon('plus') + 'Create your first group</button>' +
          '<button class="text-btn" type="button" data-action="demo-data">or load sample data</button>'
      });
    } else if (!filteredGroups.length) {
      groupsBody = emptyStateHTML({
        icon: 'search',
        compact: true,
        title: 'No groups match',
        text: 'Try a different name or member.'
      });
    } else {
      groupsBody = filteredGroups.slice(0, 4).map(groupCardHTML).join('');
      if (filteredGroups.length > 4) {
        groupsBody += '<button class="btn btn-small btn-block" type="button" data-nav="groups">View all ' + groups.length + ' groups ' + icon('arrow-right') + '</button>';
      }
    }

    var activityBody;
    if (!state.expenses.length) {
      activityBody = emptyStateHTML({
        icon: 'receipt',
        compact: true,
        title: 'No activity yet',
        text: groups.length ? 'Add your first expense and it will appear here.' : 'Create a group, then add your first shared expense.',
        actions: groups.length
          ? '<button class="btn btn-small btn-primary" type="button" data-action="new-expense">' + icon('plus') + 'Add expense</button>'
          : '<button class="btn btn-small btn-primary" type="button" data-action="new-group">' + icon('plus') + 'New group</button>'
      });
    } else if (!recent.length) {
      activityBody = emptyStateHTML({
        icon: 'search',
        compact: true,
        title: 'No matching activity',
        text: 'Try searching a different description or group.'
      });
    } else {
      activityBody = '<div class="activity-list">' + recent.map(activityRowHTML).join('') + '</div>';
    }

    els.mainContent.innerHTML = stats +
      '<div class="dashboard-grid">' +
        '<section class="panel groups-section">' +
          '<div class="section-head">' +
            '<div><h2>My groups</h2><p class="section-sub">' +
              (groups.length ? groups.length + ' shared space' + (groups.length === 1 ? '' : 's') : 'Your shared spaces will live here') +
            '</p></div>' +
            '<button class="btn btn-small btn-primary" type="button" data-action="new-group">' + icon('plus') + 'New group</button>' +
          '</div>' +
          '<div class="group-list">' + groupsBody + '</div>' +
        '</section>' +
        '<section class="panel activity-section">' +
          '<div class="section-head">' +
            '<div><h2>Recent activity</h2><p class="section-sub">The latest shared expenses</p></div>' +
            '<button class="section-link" type="button" data-nav="expenses">View all ' + icon('arrow-right') + '</button>' +
          '</div>' +
          activityBody +
        '</section>' +
      '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Groups view                                                        */
  /* ------------------------------------------------------------------ */

  function renderGroups() {
    var state = currentState();
    var query = ui.search.toLowerCase();
    var groups = state.groups.filter(function (group) { return groupMatchesSearch(group, query); });
    var totalMembers = uniquePeopleCount(state.groups);

    var toolbar = '<div class="page-toolbar">' +
      '<div class="toolbar-summary">' +
        '<span class="count-chip">' + state.groups.length + ' group' + (state.groups.length === 1 ? '' : 's') + '</span>' +
        '<span>·</span><span><strong>' + totalMembers + '</strong> people</span>' +
        '<span>·</span><span><strong>' + state.expenses.length + '</strong> expenses</span>' +
      '</div>' +
      '<div class="toolbar-actions">' +
        '<button class="btn btn-primary" type="button" data-action="new-group">' + icon('plus') + 'New group</button>' +
      '</div>' +
    '</div>';

    var body;
    if (!state.groups.length) {
      body = emptyStateHTML({
        icon: 'users',
        title: 'Start your first group',
        text: 'Trips, flats and office lunches all start with a group. Add your people and HISAAB does the maths.',
        actions:
          '<button class="btn btn-primary btn-small" type="button" data-action="new-group">' + icon('plus') + 'Create a group</button>' +
          '<button class="text-btn" type="button" data-action="demo-data">or load sample data</button>'
      });
    } else if (!groups.length) {
      body = emptyStateHTML({
        icon: 'search',
        title: 'No groups match',
        text: 'Try searching by the group name or one of its members.'
      });
    } else {
      body = '<div class="group-grid">' + groups.map(groupCardHTML).join('') + '</div>';
    }

    els.mainContent.innerHTML = toolbar + body;
  }

  /* ------------------------------------------------------------------ */
  /* Expenses view                                                      */
  /* ------------------------------------------------------------------ */

  function renderExpenses() {
    var state = currentState();
    var groups = state.groups;
    var validFilter = groups.some(function (group) { return group.id === ui.expenseGroupFilter; });
    if (ui.expenseGroupFilter !== 'all' && !validFilter) ui.expenseGroupFilter = 'all';

    var query = ui.search.toLowerCase();
    var expenses = sortedExpenses(state.expenses).filter(function (expense) {
      if (ui.expenseGroupFilter !== 'all' && expense.groupId !== ui.expenseGroupFilter) return false;
      return expenseMatchesSearch(expense, query);
    });

    var options = '<option value="all"' + (ui.expenseGroupFilter === 'all' ? ' selected' : '') + '>All groups</option>' +
      groups.map(function (group) {
        return '<option value="' + esc(group.id) + '"' + (ui.expenseGroupFilter === group.id ? ' selected' : '') + '>' + esc(group.name) + '</option>';
      }).join('');

    var filterBar = '<div class="filter-bar">' +
      '<div class="filter-field"><label for="expenseGroupFilter">Filter by group</label>' +
        '<select class="select" id="expenseGroupFilter">' + options + '</select>' +
      '</div>' +
      '<div class="filter-spacer"></div>' +
      '<span class="result-count">' + expenses.length + ' expense' + (expenses.length === 1 ? '' : 's') + ' shown</span>' +
      '<button class="btn btn-primary" type="button" data-action="new-expense">' + icon('plus') + 'Add expense</button>' +
    '</div>';

    var body;
    if (!state.expenses.length) {
      body = '<div class="table-card"><div class="table-empty">' +
        '<h3>No expenses yet</h3>' +
        '<p>' + (groups.length ? 'Add an expense and HISAAB will split it equally.' : 'Create a group before adding an expense.') + '</p>' +
        (groups.length
          ? '<button class="btn btn-primary btn-small" type="button" data-action="new-expense">' + icon('plus') + 'Add your first expense</button>'
          : '<button class="btn btn-primary btn-small" type="button" data-action="new-group">' + icon('plus') + 'Create a group</button>') +
        '</div></div>';
    } else if (!expenses.length) {
      body = '<div class="table-card"><div class="table-empty">' +
        '<h3>No expenses match</h3>' +
        '<p>Try another search or choose a different group.</p>' +
        '<button class="btn btn-small" type="button" data-action="reset-expense-filter">' + icon('refresh') + 'Reset filters</button>' +
        '</div></div>';
    } else {
      var rows = expenses.map(function (expense) {
        var group = Store.getGroup(expense.groupId);
        if (!group) return '';
        var payer = findMember(group, expense.paidBy);
        var participantCount = expense.participants.length;

        return '<tr>' +
          '<td><span class="expense-title">' + esc(expense.description) + '</span>' +
            '<span class="expense-sub">Split with ' + participantCount + ' member' + (participantCount === 1 ? '' : 's') + '</span></td>' +
          '<td><span class="group-tag tone-' + toneFor(group.id) + '">' + esc(group.name) + '</span></td>' +
          '<td><span class="payer-cell">' + avatarHTML(payer ? payer.name : '?', expense.paidBy, 'tiny') +
            esc(payer ? payer.name : 'Unknown') + (expense.paidBy === ME ? ' (you)' : '') + '</span></td>' +
          '<td>' + esc(Core.formatDate(expense.date)) + '</td>' +
          '<td class="amount-col amount-cell">' + money(expense.amount) + '</td>' +
          '<td><div class="table-actions">' +
            '<button class="icon-btn small" type="button" data-action="edit-expense" data-id="' + esc(expense.id) + '" aria-label="Edit ' + esc(expense.description) + '">' + icon('edit') + '</button>' +
            '<button class="icon-btn small" type="button" data-action="delete-expense" data-id="' + esc(expense.id) + '" aria-label="Delete ' + esc(expense.description) + '">' + icon('trash') + '</button>' +
          '</div></td>' +
        '</tr>';
      }).join('');

      body = '<div class="table-card"><div class="table-scroll"><table class="expense-table">' +
        '<thead><tr><th>Description</th><th>Group</th><th>Paid by</th><th>Date</th><th class="amount-col">Amount</th><th class="amount-col">Actions</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div></div>';
    }

    els.mainContent.innerHTML = filterBar + body;
  }

  /* ------------------------------------------------------------------ */
  /* Settlements view                                                   */
  /* ------------------------------------------------------------------ */

  function paymentRowHTML(group, payment) {
    var fromMember = findMember(group, payment.from);
    var toMember = findMember(group, payment.to);
    if (!fromMember || !toMember) return '';

    return '<div class="settlement-row">' +
      '<div class="settlement-route">' +
        avatarHTML(fromMember.name, fromMember.id, 'tiny') +
        '<div class="settlement-route-copy">' +
          '<strong>' + esc(fromMember.name) + (fromMember.id === ME ? ' (you)' : '') + '</strong>' +
          '<span>pays ' + esc(toMember.name) + (toMember.id === ME ? ' (you)' : '') + '</span>' +
        '</div>' +
        icon('arrow-right', 'settlement-arrow') +
        avatarHTML(toMember.name, toMember.id, 'tiny') +
      '</div>' +
      '<span class="settlement-amount">' + money(payment.amount) + '</span>' +
      '<button class="btn btn-small btn-primary" type="button" data-action="record-settlement"' +
        ' data-group-id="' + esc(group.id) + '"' +
        ' data-from="' + esc(payment.from) + '"' +
        ' data-to="' + esc(payment.to) + '"' +
        ' data-amount="' + esc(payment.amount) + '">Record</button>' +
    '</div>';
  }

  function balanceRowHTML(group, member, amount) {
    var rounded = Core.roundMoney(amount);
    var status = rounded > EPS ? 'should receive' : rounded < -EPS ? 'should pay' : 'settled up';

    return '<div class="settlement-row">' +
      avatarHTML(member.name, member.id, 'tiny') +
      '<div class="settlement-route-copy">' +
        '<strong>' + esc(member.name) + (member.id === ME ? ' (you)' : '') + '</strong>' +
        '<span>' + status + '</span>' +
      '</div>' +
      '<span class="balance-value ' + yourBalanceClass(rounded) + '">' + money(Math.abs(rounded)) + '</span>' +
    '</div>';
  }

  function renderSettlements() {
    var state = currentState();
    var groups = state.groups;
    var validFilter = groups.some(function (group) { return group.id === ui.settlementGroupFilter; });
    if (ui.settlementGroupFilter !== 'all' && !validFilter) ui.settlementGroupFilter = 'all';

    if (!groups.length) {
      els.mainContent.innerHTML = emptyStateHTML({
        icon: 'settle',
        title: 'Nothing to settle yet',
        text: 'Create a group and add a few expenses. HISAAB will work out exactly who should pay whom.',
        actions: '<button class="btn btn-primary btn-small" type="button" data-action="new-group">' + icon('plus') + 'Create a group</button>'
      });
      return;
    }

    var settlementQuery = ui.search.toLowerCase();
    var visibleGroups = groups.filter(function (group) {
      if (ui.settlementGroupFilter !== 'all' && group.id !== ui.settlementGroupFilter) return false;
      return groupMatchesSearch(group, settlementQuery);
    });

    var totalPayments = 0;
    var groupBlocks = visibleGroups.map(function (group) {
      var net = getNet(group);
      var plan = Core.minimizeSettlements(net);
      var groupExpenses = Store.getGroupExpenses(group.id);
      var total = groupExpenses.reduce(function (sum, expense) { return sum + Number(expense.amount); }, 0);
      var recorded = Store.getGroupSettlements(group.id);
      totalPayments += plan.length;

      var balances = group.members.map(function (member) {
        return balanceRowHTML(group, member, net[member.id] || 0);
      }).join('');

      var planHTML = plan.length
        ? plan.map(function (payment) { return paymentRowHTML(group, payment); }).join('')
        : '<div class="settled-line">' + icon('check') + 'Everyone in this group is settled up.</div>';

      return '<section class="settlement-group">' +
        '<div class="settlement-head">' +
          '<span class="group-mark tone-' + toneFor(group.id) + '">' + esc(groupMonogram(group.name)) + '</span>' +
          '<div class="settlement-head-copy"><h3>' + esc(group.name) + '</h3>' +
            '<p>' + group.members.length + ' members · ' + money(total) + ' in expenses' +
            (recorded.length ? ' · ' + recorded.length + ' payment' + (recorded.length === 1 ? '' : 's') + ' recorded' : '') +
            '</p></div>' +
          (plan.length
            ? '<span class="pending-badge">' + plan.length + ' payment' + (plan.length === 1 ? '' : 's') + '</span>'
            : '<span class="settled-badge">' + icon('check') + 'Settled</span>') +
        '</div>' +
        '<div class="settlement-body">' +
          '<div class="balance-column">' +
            '<div class="column-title"><span>Net balances</span><span>' + groupExpenses.length + ' expenses</span></div>' +
            '<div class="member-balance-list">' + balances + '</div>' +
          '</div>' +
          '<div class="plan-column">' +
            '<div class="column-title"><span>Fewest payments</span><span>' + plan.length + ' needed</span></div>' +
            '<div class="plan-list">' + planHTML + '</div>' +
          '</div>' +
        '</div>' +
      '</section>';
    }).join('');

    if (!visibleGroups.length) {
      groupBlocks = emptyStateHTML({
        icon: 'search',
        title: 'No settlements match',
        text: 'Try another group, member name or clear the search.'
      });
    }

    var filterOptions = '<option value="all"' + (ui.settlementGroupFilter === 'all' ? ' selected' : '') + '>All groups</option>' +
      groups.map(function (group) {
        return '<option value="' + esc(group.id) + '"' + (ui.settlementGroupFilter === group.id ? ' selected' : '') + '>' + esc(group.name) + '</option>';
      }).join('');

    var toolbar = '<div class="filter-bar">' +
      '<div class="filter-field"><label for="settlementGroupFilter">Filter by group</label>' +
        '<select class="select" id="settlementGroupFilter">' + filterOptions + '</select>' +
      '</div>' +
      '<div class="filter-spacer"></div>' +
      '<span class="result-count">' + totalPayments + ' payment' + (totalPayments === 1 ? '' : 's') + ' needed</span>' +
      '<button class="btn" type="button" data-action="new-expense">' + icon('plus') + 'Add expense</button>' +
    '</div>';

    var note = '<p class="ledger-note">Balances include every recorded payment. HISAAB matches debtors with creditors so each person can settle with as few transfers as possible.</p>';

    els.mainContent.innerHTML = toolbar + note + groupBlocks;
  }

  /* ------------------------------------------------------------------ */
  /* Group detail                                                       */
  /* ------------------------------------------------------------------ */

  function planRowHTML(group, payment) {
    var fromMember = findMember(group, payment.from);
    var toMember = findMember(group, payment.to);
    if (!fromMember || !toMember) return '';

    return '<div class="plan-row">' +
      '<div class="plan-route">' +
        '<strong>' + esc(fromMember.name) + (fromMember.id === ME ? ' (you)' : '') + ' → ' +
          esc(toMember.name) + (toMember.id === ME ? ' (you)' : '') + '</strong>' +
        '<span>Fewest-payment match</span>' +
      '</div>' +
      '<span class="plan-amount">' + money(payment.amount) + '</span>' +
      '<button class="icon-btn small" type="button" data-action="record-settlement"' +
        ' data-group-id="' + esc(group.id) + '"' +
        ' data-from="' + esc(payment.from) + '"' +
        ' data-to="' + esc(payment.to) + '"' +
        ' data-amount="' + esc(payment.amount) + '"' +
        ' aria-label="Record payment">' + icon('check') + '</button>' +
    '</div>';
  }

  function renderGroupDetail() {
    var group = Store.getGroup(ui.activeGroupId);
    if (!group) {
      navigate('groups');
      return;
    }

    var net = getNet(group);
    var plan = Core.minimizeSettlements(net);
    var meNet = net[ME] || 0;
    var allExpenses = sortedExpenses(Store.getGroupExpenses(group.id));
    var groupQuery = ui.search.toLowerCase();
    var expenses = allExpenses.filter(function (expense) { return expenseMatchesSearch(expense, groupQuery); });
    var recorded = Store.getGroupSettlements(group.id).slice().sort(function (a, b) {
      return String(b.date).localeCompare(String(a.date));
    });
    var total = allExpenses.reduce(function (sum, expense) { return sum + Number(expense.amount); }, 0);
    var balanceClass = yourBalanceClass(meNet);

    var hero = '<div class="group-hero">' +
      '<div class="hero-identity">' +
        '<span class="hero-mark tone-' + toneFor(group.id) + '">' + esc(groupMonogram(group.name)) + '</span>' +
        '<div class="hero-copy"><h2>' + esc(group.name) + '</h2>' +
          '<p class="hero-meta">' + group.members.length + ' members · Created ' + Core.formatDate(String(group.createdAt).slice(0, 10)) + '</p></div>' +
      '</div>' +
      '<div class="hero-stats">' +
        '<div class="hero-stat"><span>Total spend</span><strong>' + money(total) + '</strong></div>' +
        '<div class="hero-stat"><span>Your balance</span><strong class="' + balanceClass + '">' + yourBalanceText(meNet) + '</strong></div>' +
      '</div>' +
      '<div class="hero-actions">' +
        '<button class="btn btn-primary" type="button" data-action="new-expense" data-group-id="' + esc(group.id) + '">' + icon('plus') + 'Add expense</button>' +
        '<button class="btn" type="button" data-action="settle-group" data-id="' + esc(group.id) + '"' + (plan.length ? '' : ' disabled') + '>' + icon('settle') + 'Settle up</button>' +
        '<button class="icon-btn" type="button" data-action="delete-group" data-id="' + esc(group.id) + '" aria-label="Delete group" title="Delete group">' + icon('trash') + '</button>' +
      '</div>' +
    '</div>';

    var expenseRows;
    if (!expenses.length) {
      expenseRows = groupQuery
        ? emptyStateHTML({
          icon: 'search',
          compact: true,
          title: 'No matching expenses',
          text: 'Try a different description or clear the search.'
        })
        : emptyStateHTML({
          icon: 'receipt',
          compact: true,
          title: 'No expenses in this group',
          text: 'Add the first shared cost and HISAAB will split it fairly.',
          actions: '<button class="btn btn-small btn-primary" type="button" data-action="new-expense" data-group-id="' + esc(group.id) + '">' + icon('plus') + 'Add expense</button>'
        });
    } else {
      expenseRows = '<div class="expense-list">' + expenses.map(function (expense) {
        var payer = findMember(group, expense.paidBy);
        return '<div class="expense-row">' +
          '<span class="expense-icon tone-' + toneFor(expense.id) + '">' + icon('receipt') + '</span>' +
          '<div class="expense-copy">' +
            '<strong>' + esc(expense.description) + '</strong>' +
            '<span class="expense-meta">' + esc(Core.formatDate(expense.date)) + ' · Paid by ' +
              esc(payer ? payer.name : 'Unknown') + (expense.paidBy === ME ? ' (you)' : '') +
              ' · ' + expense.participants.length + ' sharing</span>' +
          '</div>' +
          '<div class="expense-side">' +
            '<strong>' + money(expense.amount) + '</strong>' +
            '<div class="expense-actions">' +
              '<button class="icon-btn small" type="button" data-action="edit-expense" data-id="' + esc(expense.id) + '" aria-label="Edit expense">' + icon('edit') + '</button>' +
              '<button class="icon-btn small" type="button" data-action="delete-expense" data-id="' + esc(expense.id) + '" aria-label="Delete expense">' + icon('trash') + '</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>';
    }

    var memberRows = group.members.map(function (member) {
      var info = balanceInfo(net[member.id] || 0, 'member');
      return '<div class="member-balance-row">' +
        avatarHTML(member.name, member.id, 'tiny') +
        '<span class="member-name">' + esc(member.name) + (member.id === ME ? '<span class="you-tag">You</span>' : '') + '</span>' +
        '<span class="balance-value ' + info.cls + '">' + info.text + '</span>' +
      '</div>';
    }).join('');

    var planHTML = plan.length
      ? plan.map(function (payment) { return planRowHTML(group, payment); }).join('')
      : '<div class="settled-line">' + icon('check') + 'Everyone is square. No payments needed.</div>';

    var recordedHTML = recorded.length
      ? '<p class="column-title recorded-title">Payments recorded</p><div class="recorded-list">' +
        recorded.map(function (settlement) {
          return '<div class="recorded-row">' +
            '<span class="recorded-copy">' + esc(Core.formatDate(settlement.date)) + ' · <strong>' +
              esc(memberName(group, settlement.from)) + '</strong> paid <strong>' +
              esc(memberName(group, settlement.to)) + '</strong></span>' +
            '<span class="recorded-amount">' + money(settlement.amount) + '</span>' +
            '<button class="icon-btn small" type="button" data-action="delete-settlement" data-id="' + esc(settlement.id) + '" aria-label="Delete recorded payment">' + icon('trash') + '</button>' +
          '</div>';
        }).join('') + '</div>'
      : '';

    els.mainContent.innerHTML =
      '<button class="detail-back" type="button" data-nav="groups">' + icon('arrow-left') + 'Back to all groups</button>' +
      hero +
      '<div class="detail-grid">' +
        '<section class="panel expense-panel">' +
          '<div class="section-head">' +
            '<div><h2>Group expenses</h2><p class="section-sub">' +
              (groupQuery ? expenses.length + ' matching' : allExpenses.length + ' recorded') +
              ' · ' + money(total) + ' total</p></div>' +
            '<button class="section-link" type="button" data-action="view-group-expenses" data-id="' + esc(group.id) + '">Open ledger ' + icon('arrow-right') + '</button>' +
          '</div>' +
          expenseRows +
        '</section>' +
        '<aside class="detail-side">' +
          '<section class="panel members-panel">' +
            '<div class="section-head"><div><h2>Members</h2><p class="section-sub">' + group.members.length + ' people in this group</p></div></div>' +
            '<div class="member-balance-list">' + memberRows + '</div>' +
          '</section>' +
          '<section class="panel plan-panel">' +
            '<div class="section-head"><div><h2>Settle up</h2><p class="section-sub">' +
              (plan.length ? plan.length + ' payment' + (plan.length === 1 ? '' : 's') + ' to clear everything' : 'No pending payments') +
            '</p></div></div>' +
            '<div class="plan-list">' + planHTML + '</div>' +
            recordedHTML +
          '</section>' +
        '</aside>' +
      '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Settings                                                           */
  /* ------------------------------------------------------------------ */

  function renderSettings() {
    var state = currentState();
    var info = Store.storageInfo();
    var currency = Core.getCurrency(state.profile.currency);

    var currencyOptions = Object.keys(Core.CURRENCIES).map(function (code) {
      var item = Core.CURRENCIES[code];
      return '<option value="' + code + '"' + (state.profile.currency === code ? ' selected' : '') + '>' +
        CURRENCY_NAMES[code] + ' (' + item.symbol + ')</option>';
    }).join('');

    var storageNote = info.persistent
      ? '<div class="storage-note">' + icon('database') +
        '<span><strong>Saved in this browser.</strong> Groups, expenses and payments live in Local Storage under <strong>' + esc(info.key) + '</strong> (' + formatBytes(info.bytes) + ').</span></div>'
      : '<div class="storage-note warning">' + icon('alert') +
        '<span><strong>Local Storage is unavailable.</strong> You can still use HISAAB in this tab, but changes will be lost when it closes.</span></div>';

    els.mainContent.innerHTML =
      '<div class="settings-grid">' +
        '<div class="settings-column">' +
          '<section class="panel settings-panel">' +
            '<h2>Your profile</h2>' +
            '<p>This name is used as “you” in every group and settlement.</p>' +
            '<form class="settings-form" id="settingsForm" novalidate>' +
              '<div class="field-row">' +
                '<div class="field"><label for="settingsName">Display name</label>' +
                  '<input class="input" id="settingsName" name="name" maxlength="40" autocomplete="name" value="' + esc(state.profile.name) + '" required>' +
                '</div>' +
                '<div class="field"><label for="settingsCurrency">Currency</label>' +
                  '<select class="select" id="settingsCurrency" name="currency">' + currencyOptions + '</select>' +
                '</div>' +
              '</div>' +
              '<p class="form-hint">Currency symbol used across HISAAB: <strong>' + esc(currency.symbol) + '</strong>. Changing it only changes the display, not the stored amounts.</p>' +
              '<div class="inline-error" id="settingsError" hidden></div>' +
              '<div class="settings-submit"><button class="btn btn-primary" type="submit">' + icon('check') + 'Save changes</button></div>' +
            '</form>' +
          '</section>' +
        '</div>' +
        '<div class="settings-column">' +
          '<section class="panel settings-panel">' +
            '<h2>Your data</h2>' +
            '<p>Everything is stored locally. No account, server or internet connection needed.</p>' +
            '<div class="data-stats">' +
              '<div class="data-stat"><span>Groups</span><strong>' + info.groupCount + '</strong></div>' +
              '<div class="data-stat"><span>Expenses</span><strong>' + info.expenseCount + '</strong></div>' +
              '<div class="data-stat"><span>Payments</span><strong>' + info.settlementCount + '</strong></div>' +
            '</div>' +
            storageNote +
            '<div class="data-actions">' +
              '<button class="btn" type="button" data-action="export-data">' + icon('download') + 'Export JSON backup</button>' +
              '<button class="btn" type="button" data-action="demo-data">' + icon('spark') + 'Load sample data</button>' +
              '<button class="btn btn-danger" type="button" data-action="clear-data">' + icon('trash') + 'Clear all data</button>' +
            '</div>' +
          '</section>' +
        '</div>' +
        '<div class="settings-column about-column">' +
          '<section class="panel settings-panel about-panel">' +
            '<h2>Split smart. Settle easy.</h2>' +
            '<div class="about-list">' +
              '<div class="about-item">' + icon('check') + '<span><strong>Equal split:</strong> every expense is divided across its selected participants to the exact paise.</span></div>' +
              '<div class="about-item">' + icon('settle') + '<span><strong>Fewest payments:</strong> HISAAB matches the biggest debtor with the biggest creditor, clearing the group in at most N-1 transfers.</span></div>' +
              '<div class="about-item">' + icon('database') + '<span><strong>Local-first:</strong> your data is saved in this browser with Local Storage. Export a backup whenever you like.</span></div>' +
              '<div class="about-item">' + icon('users') + '<span><strong>You are automatic:</strong> every new group includes your profile, so “you owe” and “you are owed” always make sense.</span></div>' +
            '</div>' +
            '<p class="about-signature">HISAAB · Split smart. Settle easy.</p>' +
          '</section>' +
        '</div>' +
      '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Right panel                                                        */
  /* ------------------------------------------------------------------ */

  function calendarHTML() {
    var state = currentState();
    var year = ui.calendar.year;
    var month = ui.calendar.month;
    var today = Core.todayISO();
    var selected = ui.calendar.selected;
    var first = new Date(year, month, 1);
    var mondayOffset = (first.getDay() + 6) % 7;
    var start = new Date(year, month, 1 - mondayOffset);

    var expenseCounts = {};
    state.expenses.forEach(function (expense) {
      expenseCounts[expense.date] = (expenseCounts[expense.date] || 0) + 1;
    });

    var weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(function (day) {
      return '<span>' + day + '</span>';
    }).join('');

    var cells = [];
    for (var i = 0; i < 42; i++) {
      var date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      var iso = Core.toISODate(date);
      var classes = ['cal-day'];
      if (date.getMonth() !== month) classes.push('is-outside');
      if (iso === today) classes.push('is-today');
      if (iso === selected) classes.push('is-selected');
      if (expenseCounts[iso]) classes.push('has-event');

      cells.push('<button class="' + classes.join(' ') + '" type="button" data-action="calendar-day" data-date="' + iso + '"' +
        ' aria-label="' + esc(Core.formatDate(iso, 'long')) + (expenseCounts[iso] ? ', ' + expenseCounts[iso] + ' expenses' : '') + '">' +
        date.getDate() + (expenseCounts[iso] ? '<span class="cal-dot"></span>' : '') +
        '</button>');
    }

    var selectedExpenses = state.expenses.filter(function (expense) { return expense.date === selected; });
    var selectedTotal = selectedExpenses.reduce(function (sum, expense) { return sum + Number(expense.amount); }, 0);
    var summary = selectedExpenses.length
      ? selectedExpenses.length + ' expense' + (selectedExpenses.length === 1 ? '' : 's') + ' · ' + money(selectedTotal)
      : 'No expenses on this day.';

    return '<section class="rp-card calendar-card">' +
      '<div class="calendar-head">' +
        '<button class="calendar-nav" type="button" data-action="calendar-prev" aria-label="Previous month">' + icon('chevron-left') + '</button>' +
        '<span class="calendar-title">' + esc(Core.formatMonthYear(first)) + '</span>' +
        '<button class="calendar-nav" type="button" data-action="calendar-next" aria-label="Next month">' + icon('chevron-right') + '</button>' +
      '</div>' +
      '<div class="calendar-weekdays">' + weekdays + '</div>' +
      '<div class="calendar-grid">' + cells.join('') + '</div>' +
      '<div class="calendar-summary">' +
        '<span class="calendar-summary-title">' + esc(Core.formatDate(selected)) + '</span>' +
        '<span class="calendar-summary-text">' + esc(summary) + '</span>' +
      '</div>' +
    '</section>';
  }

  function upcomingHTML() {
    var state = currentState();
    var today = Core.todayISO();
    var upcoming = state.expenses.filter(function (expense) {
      return expense.date >= today && Store.getGroup(expense.groupId);
    }).sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date));
    }).slice(0, 3);

    var body = upcoming.length ? upcoming.map(function (expense) {
      var group = Store.getGroup(expense.groupId);
      var date = Core.parseISODate(expense.date);
      var monthShort = new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(date).toUpperCase();

      return '<button class="upcoming-row" type="button" data-open-group="' + esc(group.id) + '">' +
        '<span class="date-block tone-' + toneFor(group.id) + '"><strong>' + date.getDate() + '</strong><span>' + monthShort + '</span></span>' +
        '<span class="upcoming-copy"><strong>' + esc(expense.description) + '</strong>' +
          '<span>' + esc(group.name) + ' · ' + money(expense.amount) + '</span></span>' +
        '</button>';
    }).join('') : '<div class="mini-empty"><strong>No upcoming activity</strong>Expenses dated today or later appear here.</div>';

    return '<section class="rp-card upcoming-card">' +
      '<div class="rp-section-head"><h3>Upcoming</h3>' +
        '<button class="rp-card-link" type="button" data-nav="expenses">Ledger</button>' +
      '</div>' +
      '<div class="upcoming-list">' + body + '</div>' +
    '</section>';
  }

  function pendingHTML() {
    var pending = getPendingForMe();
    var body;

    if (pending.length) {
      body = pending.slice(0, 4).map(function (item) {
        var copy = item.from === ME ? 'You pay ' + esc(item.toName) : esc(item.fromName) + ' pays you';
        return '<button class="settle-row" type="button" data-action="record-settlement"' +
          ' data-group-id="' + esc(item.group.id) + '"' +
          ' data-from="' + esc(item.from) + '"' +
          ' data-to="' + esc(item.to) + '"' +
          ' data-amount="' + esc(item.amount) + '">' +
          '<span class="settle-people"><strong>' + copy + '</strong><span>' + esc(item.group.name) + '</span></span>' +
          '<span class="settle-amount">' + money(item.amount) + '</span>' +
          '<span class="settle-go">' + icon('arrow-right') + '</span>' +
          '</button>';
      }).join('');
    } else {
      body = '<div class="mini-empty"><strong>All settled up</strong>' +
        (currentState().groups.length ? 'No payments are waiting on you.' : 'No settlements yet.') + '</div>';
    }

    return '<section class="rp-card settlements-card">' +
      '<div class="rp-section-head"><h3>Settle up</h3>' +
        '<button class="rp-card-link" type="button" data-nav="settlements">View all</button>' +
      '</div>' +
      body +
    '</section>';
  }

  function renderRightPanel() {
    var dateLabel = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).format(new Date());

    els.rightPanel.innerHTML =
      '<div class="rp-head">' +
        '<div><p class="rp-kicker">' + esc(dateLabel) + '</p><h2 class="rp-title">Your day at a glance</h2></div>' +
        '<span class="rp-mark">H</span>' +
      '</div>' +
      calendarHTML() +
      upcomingHTML() +
      pendingHTML() +
      '<button class="quick-add" type="button" data-action="new-expense">' +
        '<span class="qa-icon">' + icon('plus') + '</span>' +
        '<span class="qa-copy"><strong>Add an expense</strong><span>Split it equally in seconds</span></span>' +
        '<span class="qa-arrow">' + icon('arrow-right') + '</span>' +
      '</button>' +
      '<p class="rp-footnote">Split smart. Settle easy.</p>';
  }

  /* ------------------------------------------------------------------ */
  /* Rendering coordinator                                              */
  /* ------------------------------------------------------------------ */

  function renderMain() {
    switch (ui.view) {
      case 'groups':
        renderGroups();
        break;
      case 'expenses':
        renderExpenses();
        break;
      case 'settlements':
        renderSettlements();
        break;
      case 'settings':
        renderSettings();
        break;
      case 'group':
        renderGroupDetail();
        break;
      case 'dashboard':
      default:
        renderDashboard();
        break;
    }
  }

  function refreshAll() {
    if (ui.view === 'group' && !Store.getGroup(ui.activeGroupId)) {
      ui.view = 'groups';
      ui.activeGroupId = null;
      ui.search = '';
      if (els.search) els.search.value = '';
    }
    renderHeader();
    renderProfile();
    renderNavigation();
    renderMain();
    renderRightPanel();
    renderNotifications();
  }

  function navigate(view, options) {
    var opts = options || {};

    if (view === 'group') {
      if (!opts.groupId || !Store.getGroup(opts.groupId)) {
        toast('That group could not be found.', 'error');
        view = 'groups';
      } else {
        ui.activeGroupId = opts.groupId;
      }
    } else {
      ui.activeGroupId = null;
    }

    if (view === 'expenses' && opts.groupId) ui.expenseGroupFilter = opts.groupId;
    if (view === 'settlements' && opts.groupId) ui.settlementGroupFilter = opts.groupId;

    ui.view = view;
    ui.search = '';
    if (els.search) els.search.value = '';
    closeDropdowns();
    renderHeader();
    renderProfile();
    renderNavigation();
    renderMain();
    renderRightPanel();
    renderNotifications();

    if (els.viewScroll) els.viewScroll.scrollTop = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Toasts + dropdowns                                                 */
  /* ------------------------------------------------------------------ */

  function toast(message, type) {
    if (!els.toastRoot) return;
    var kind = type || 'success';
    var iconName = kind === 'error' ? 'alert' : kind === 'info' ? 'info' : 'check';
    var element = document.createElement('div');
    element.className = 'toast toast-' + kind;
    element.innerHTML =
      '<span class="toast-icon">' + icon(iconName) + '</span>' +
      '<span class="toast-message"></span>' +
      '<button class="toast-close" type="button" aria-label="Dismiss notification">' + icon('close') + '</button>';
    element.querySelector('.toast-message').textContent = message;

    var root = els.toastRoot;
    root.appendChild(element);
    if (root.children.length > 4) root.removeChild(root.firstElementChild);

    var timer = window.setTimeout(function () { removeToast(element); }, 3800);
    element.querySelector('.toast-close').addEventListener('click', function () {
      window.clearTimeout(timer);
      removeToast(element);
    });
  }

  function removeToast(element) {
    if (!element || !element.parentNode) return;
    element.classList.add('is-leaving');
    window.setTimeout(function () {
      if (element.parentNode) element.parentNode.removeChild(element);
    }, 190);
  }

  function closeDropdowns() {
    if (els.bellDropdown) els.bellDropdown.hidden = true;
    if (els.profileDropdown) els.profileDropdown.hidden = true;
    if (els.bellButton) els.bellButton.setAttribute('aria-expanded', 'false');
    if (els.profileButton) els.profileButton.setAttribute('aria-expanded', 'false');
  }

  function toggleDropdown(which) {
    var dropdown = which === 'bell' ? els.bellDropdown : els.profileDropdown;
    var button = which === 'bell' ? els.bellButton : els.profileButton;
    if (!dropdown || !button) return;

    var willOpen = dropdown.hidden;
    closeDropdowns();

    if (willOpen) {
      if (which === 'bell') renderNotifications();
      dropdown.hidden = false;
      button.setAttribute('aria-expanded', 'true');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Modal helpers                                                      */
  /* ------------------------------------------------------------------ */

  function openModal(options) {
    var opts = options || {};
    var sizeClass = opts.wide ? ' modal-wide' : opts.small ? ' modal-small' : '';

    els.modalRoot.innerHTML =
      '<div class="modal-overlay" data-modal-overlay>' +
        '<div class="modal' + sizeClass + '" role="dialog" aria-modal="true" aria-labelledby="modalTitle">' +
          '<div class="modal-head">' +
            '<div>' +
              (opts.kicker ? '<p class="modal-kicker">' + esc(opts.kicker) + '</p>' : '') +
              '<h2 id="modalTitle">' + esc(opts.title) + '</h2>' +
            '</div>' +
            '<button class="modal-close" type="button" data-action="close-modal" aria-label="Close dialog">' + icon('close') + '</button>' +
          '</div>' +
          '<div class="modal-body">' + opts.body + '</div>' +
        '</div>' +
      '</div>';

    document.body.classList.add('modal-open');

    var overlay = $('[data-modal-overlay]', els.modalRoot);
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closeModal();
    });

    var focusTarget = els.modalRoot.querySelector('input:not([type="hidden"]), select, button, textarea');
    if (focusTarget) {
      window.setTimeout(function () { focusTarget.focus(); }, 40);
    }
  }

  function closeModal() {
    if (!els.modalRoot) return;
    els.modalRoot.innerHTML = '';
    document.body.classList.remove('modal-open');
  }

  function showFormError(id, message) {
    var element = document.getElementById(id);
    if (!element) {
      toast(message, 'error');
      return;
    }
    element.hidden = false;
    element.innerHTML = icon('alert') + '<span></span>';
    element.querySelector('span').textContent = message;
    try { element.scrollIntoView({ block: 'nearest' }); } catch (error) { /* ignore */ }
  }

  function hideFormError(id) {
    var element = document.getElementById(id);
    if (element) {
      element.hidden = true;
      element.innerHTML = '';
    }
  }

  function confirmDialog(options) {
    openModal({
      title: options.title,
      kicker: 'PLEASE CONFIRM',
      small: true,
      body: '<p class="confirm-copy">' + options.message + '</p>' +
        '<div class="modal-actions">' +
          '<button class="btn" type="button" data-action="close-modal">Cancel</button>' +
          '<button class="btn ' + (options.danger ? 'btn-danger' : 'btn-primary') + '" type="button" id="confirmActionBtn">' +
            esc(options.confirmLabel || 'Confirm') +
          '</button>' +
        '</div>'
    });

    var button = document.getElementById('confirmActionBtn');
    if (button) {
      button.addEventListener('click', function () {
        closeModal();
        options.onConfirm();
      }, { once: true });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Group form                                                         */
  /* ------------------------------------------------------------------ */

  function memberRowHTML(value) {
    return '<div class="member-row">' +
      '<input class="input member-name" type="text" maxlength="40" placeholder="Member name" value="' + esc(value || '') + '" autocomplete="off">' +
      '<button class="remove-member" type="button" data-action="remove-member" aria-label="Remove member">' + icon('minus') + '</button>' +
    '</div>';
  }

  function openGroupModal() {
    openModal({
      title: 'Create a group',
      kicker: 'NEW GROUP',
      body:
        '<form id="groupForm" novalidate>' +
          '<div class="field"><label for="groupName">Group name</label>' +
            '<input class="input" id="groupName" name="groupName" maxlength="60" placeholder="e.g. Goa Trip 2026" autocomplete="off" required>' +
          '</div>' +
          '<div class="form-section-head">' +
            '<div><span class="field-label">Members</span>' +
              '<p class="form-hint">You (' + esc(currentState().profile.name) + ') are added automatically.</p></div>' +
            '<div class="select-actions"><button class="text-btn" type="button" data-action="add-member">' + icon('plus') + 'Add member</button></div>' +
          '</div>' +
          '<div class="member-rows" id="memberRows">' + memberRowHTML('') + '</div>' +
          '<div class="inline-error" id="groupFormError" hidden></div>' +
          '<div class="modal-actions">' +
            '<button class="btn" type="button" data-action="close-modal">Cancel</button>' +
            '<button class="btn btn-primary" type="submit">' + icon('check') + 'Create group</button>' +
          '</div>' +
        '</form>'
    });
  }

  /* ------------------------------------------------------------------ */
  /* Expense form                                                       */
  /* ------------------------------------------------------------------ */

  function openExpenseModal(options) {
    var opts = options || {};
    var state = currentState();
    var groups = state.groups;

    if (!groups.length) {
      toast('Create a group before adding an expense.', 'info');
      openGroupModal();
      return;
    }

    var expense = opts.expenseId
      ? state.expenses.find(function (item) { return item.id === opts.expenseId; })
      : null;

    if (opts.expenseId && !expense) {
      toast('That expense could not be found.', 'error');
      return;
    }

    var selectedGroupId = expense ? expense.groupId : (opts.groupId || (ui.view === 'group' ? ui.activeGroupId : null) || groups[0].id);
    if (!Store.getGroup(selectedGroupId)) selectedGroupId = groups[0].id;

    var groupOptions = groups.map(function (group) {
      return '<option value="' + esc(group.id) + '"' + (group.id === selectedGroupId ? ' selected' : '') + '>' + esc(group.name) + '</option>';
    }).join('');

    openModal({
      title: expense ? 'Edit expense' : 'Add an expense',
      kicker: expense ? 'EDIT EXPENSE' : 'NEW EXPENSE',
      wide: true,
      body:
        '<form id="expenseForm" novalidate>' +
          '<input type="hidden" id="expenseId" value="' + esc(expense ? expense.id : '') + '">' +
          '<div class="field-row">' +
            '<div class="field"><label for="expenseDescription">Description</label>' +
              '<input class="input" id="expenseDescription" maxlength="90" placeholder="e.g. Beach shack dinner" autocomplete="off" value="' + esc(expense ? expense.description : '') + '" required>' +
            '</div>' +
            '<div class="field"><label for="expenseAmount">Amount</label>' +
              '<div class="money-input"><span class="currency-prefix">' + esc(currencySymbol()) + '</span>' +
                '<input id="expenseAmount" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="0" value="' + esc(expense ? expense.amount : '') + '" required>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="field-row even">' +
            '<div class="field"><label for="expenseGroupSelect">Group</label>' +
              '<select class="select" id="expenseGroupSelect">' + groupOptions + '</select>' +
            '</div>' +
            '<div class="field"><label for="expenseDate">Date</label>' +
              '<input class="input" id="expenseDate" type="date" value="' + esc(expense ? expense.date : Core.todayISO()) + '" required>' +
            '</div>' +
          '</div>' +
          '<div class="field"><label for="expensePayerSelect">Paid by</label>' +
            '<select class="select" id="expensePayerSelect"></select>' +
          '</div>' +
          '<div class="form-section-head">' +
            '<div><span class="field-label">Split equally between</span>' +
              '<p class="form-hint" id="participantCount">All members selected</p></div>' +
            '<div class="select-actions">' +
              '<button class="text-btn" type="button" data-action="select-all-participants">Select all</button>' +
              '<button class="text-btn" type="button" data-action="clear-participants">Clear</button>' +
            '</div>' +
          '</div>' +
          '<div class="participant-grid" id="participantList"></div>' +
          '<div class="inline-error" id="expenseFormError" hidden></div>' +
          '<div class="modal-actions">' +
            '<button class="btn" type="button" data-action="close-modal">Cancel</button>' +
            '<button class="btn btn-primary" type="submit">' + icon('check') + (expense ? 'Save changes' : 'Add expense') + '</button>' +
          '</div>' +
        '</form>'
    });

    populateExpenseMembers(selectedGroupId, expense);
  }

  function populateExpenseMembers(groupId, expense) {
    var group = Store.getGroup(groupId);
    if (!group) return;

    var payerSelect = document.getElementById('expensePayerSelect');
    var participantList = document.getElementById('participantList');
    if (!payerSelect || !participantList) return;

    payerSelect.innerHTML = group.members.map(function (member) {
      var selected = expense && expense.paidBy === member.id
        ? ' selected'
        : (!expense && member.id === ME ? ' selected' : '');
      return '<option value="' + esc(member.id) + '"' + selected + '>' + esc(member.name) + (member.id === ME ? ' (you)' : '') + '</option>';
    }).join('');

    var participantIds = expense ? expense.participants : group.members.map(function (member) { return member.id; });

    participantList.innerHTML = group.members.map(function (member) {
      var checked = participantIds.indexOf(member.id) !== -1 ? ' checked' : '';
      return '<label class="participant-option">' +
        '<input type="checkbox" data-participant value="' + esc(member.id) + '"' + checked + '>' +
        avatarHTML(member.name, member.id, 'tiny') +
        '<span class="participant-name">' + esc(member.name) + (member.id === ME ? ' (you)' : '') + '</span>' +
      '</label>';
    }).join('');

    updateParticipantCount();
  }

  function updateParticipantCount() {
    var counter = document.getElementById('participantCount');
    if (!counter) return;
    var total = $$('#participantList input[data-participant]').length;
    var checked = $$('#participantList input[data-participant]:checked').length;
    counter.textContent = checked + ' of ' + total + ' member' + (total === 1 ? '' : 's') + ' selected';
  }

  /* ------------------------------------------------------------------ */
  /* Settlement form                                                    */
  /* ------------------------------------------------------------------ */

  function openSettlementModal(options) {
    var opts = options || {};
    var state = currentState();
    var groups = state.groups;

    if (!groups.length) {
      toast('Create a group before recording a payment.', 'info');
      openGroupModal();
      return;
    }

    var groupId = opts.groupId;
    if (!groupId) {
      var firstPending = groups.find(function (group) {
        return Core.minimizeSettlements(getNet(group)).length > 0;
      });
      if (!firstPending) {
        toast('Everything is settled up.', 'info');
        return;
      }
      groupId = firstPending.id;
    }

    var group = Store.getGroup(groupId);
    if (!group) {
      toast('That group could not be found.', 'error');
      return;
    }

    if (!Core.minimizeSettlements(getNet(group)).length) {
      toast('This group is already settled up.', 'info');
      return;
    }

    var groupOptions = groups.map(function (item) {
      return '<option value="' + esc(item.id) + '"' + (item.id === groupId ? ' selected' : '') + '>' + esc(item.name) + '</option>';
    }).join('');

    openModal({
      title: 'Record a payment',
      kicker: 'SETTLE UP',
      body:
        '<form id="settlementForm" novalidate>' +
          '<div class="field"><label for="settlementGroupSelect">Group</label>' +
            '<select class="select" id="settlementGroupSelect">' + groupOptions + '</select>' +
          '</div>' +
          '<div class="field-row even">' +
            '<div class="field"><label for="settlementFrom">Paid by</label>' +
              '<select class="select" id="settlementFrom"></select>' +
            '</div>' +
            '<div class="field"><label for="settlementTo">Paid to</label>' +
              '<select class="select" id="settlementTo"></select>' +
            '</div>' +
          '</div>' +
          '<div class="field-row even">' +
            '<div class="field"><label for="settlementAmount">Amount</label>' +
              '<div class="money-input"><span class="currency-prefix">' + esc(currencySymbol()) + '</span>' +
                '<input id="settlementAmount" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="0" required>' +
              '</div>' +
            '</div>' +
            '<div class="field"><label for="settlementDate">Date</label>' +
              '<input class="input" id="settlementDate" type="date" value="' + Core.todayISO() + '" required>' +
            '</div>' +
          '</div>' +
          '<div class="suggestion-box" id="settlementHint"></div>' +
          '<div class="inline-error" id="settlementFormError" hidden></div>' +
          '<div class="modal-actions">' +
            '<button class="btn" type="button" data-action="close-modal">Cancel</button>' +
            '<button class="btn btn-primary" type="submit" id="settlementSubmit">' + icon('check') + 'Record payment</button>' +
          '</div>' +
        '</form>'
    });

    var prefill = opts.from && opts.to
      ? { from: opts.from, to: opts.to, amount: Number(opts.amount) || 0 }
      : null;

    populateSettlementMembers(groupId, prefill);
  }

  function populateSettlementMembers(groupId, prefill) {
    var group = Store.getGroup(groupId);
    if (!group) return;

    var fromSelect = document.getElementById('settlementFrom');
    var toSelect = document.getElementById('settlementTo');
    var amountInput = document.getElementById('settlementAmount');
    var hint = document.getElementById('settlementHint');
    var submit = document.getElementById('settlementSubmit');
    if (!fromSelect || !toSelect || !amountInput || !hint || !submit) return;

    var net = getNet(group);
    var debtors = group.members.filter(function (member) { return (net[member.id] || 0) < -EPS; });
    var creditors = group.members.filter(function (member) { return (net[member.id] || 0) > EPS; });
    var plan = Core.minimizeSettlements(net);

    fromSelect.innerHTML = debtors.length
      ? debtors.map(function (member) {
        return '<option value="' + esc(member.id) + '">' + esc(member.name) + (member.id === ME ? ' (you)' : '') + '</option>';
      }).join('')
      : '<option value="">No one owes</option>';

    toSelect.innerHTML = creditors.length
      ? creditors.map(function (member) {
        return '<option value="' + esc(member.id) + '">' + esc(member.name) + (member.id === ME ? ' (you)' : '') + '</option>';
      }).join('')
      : '<option value="">No one is owed</option>';

    var target = prefill && prefill.from && prefill.to
      ? prefill
      : (plan[0] || null);

    if (target) {
      fromSelect.value = target.from;
      toSelect.value = target.to;
      amountInput.value = target.amount ? Core.roundMoney(target.amount) : '';
    } else {
      amountInput.value = '';
    }

    submit.disabled = !debtors.length || !creditors.length;
    updateSettlementSuggestion();
  }

  function updateSettlementSuggestion() {
    var groupId = document.getElementById('settlementGroupSelect') ? document.getElementById('settlementGroupSelect').value : '';
    var fromId = document.getElementById('settlementFrom') ? document.getElementById('settlementFrom').value : '';
    var toId = document.getElementById('settlementTo') ? document.getElementById('settlementTo').value : '';
    var amountInput = document.getElementById('settlementAmount');
    var hint = document.getElementById('settlementHint');
    var submit = document.getElementById('settlementSubmit');
    if (!amountInput || !hint) return;

    var group = Store.getGroup(groupId);
    if (!group || !fromId || !toId) {
      hint.innerHTML = icon('info') + '<span>Choose a debtor and a creditor to see the suggested amount.</span>';
      return;
    }

    var net = getNet(group);
    var debt = -(net[fromId] || 0);
    var credit = net[toId] || 0;
    var maximum = Core.roundMoney(Math.min(Math.max(0, debt), Math.max(0, credit)));

    if (maximum <= 0) {
      hint.innerHTML = icon('alert') + '<span>These two members have no outstanding balance between them.</span>';
      if (submit) submit.disabled = true;
      return;
    }

    hint.innerHTML = icon('info') + '<span>Suggested payment: <strong>' + money(maximum) +
      '</strong> clears the full balance between them.</span>';
    amountInput.value = maximum;
    if (submit) submit.disabled = false;
  }

  /* ------------------------------------------------------------------ */
  /* Destructive actions, export and demo data                          */
  /* ------------------------------------------------------------------ */

  function confirmDeleteExpense(expenseId) {
    var state = currentState();
    var expense = state.expenses.find(function (item) { return item.id === expenseId; });
    if (!expense) {
      toast('Expense not found.', 'error');
      return;
    }
    var group = Store.getGroup(expense.groupId);

    confirmDialog({
      title: 'Delete this expense?',
      message: '<strong>' + esc(expense.description) + '</strong> · ' + money(expense.amount) +
        ' will be removed from <strong>' + esc(group ? group.name : 'this group') +
        '</strong>. Every balance will be recalculated.',
      confirmLabel: 'Delete expense',
      danger: true,
      onConfirm: function () {
        try {
          Store.deleteExpense(expenseId);
          toast('Expense deleted.', 'success');
          refreshAll();
        } catch (error) {
          toast(error.message, 'error');
        }
      }
    });
  }

  function confirmDeleteGroup(groupId) {
    var group = Store.getGroup(groupId);
    if (!group) {
      toast('Group not found.', 'error');
      return;
    }
    var expenseCount = Store.getGroupExpenses(groupId).length;
    var settlementCount = Store.getGroupSettlements(groupId).length;

    confirmDialog({
      title: 'Delete this group?',
      message: '<strong>' + esc(group.name) + '</strong> and its ' + expenseCount +
        ' expense' + (expenseCount === 1 ? '' : 's') + ' will be deleted' +
        (settlementCount ? ', along with ' + settlementCount + ' recorded payment' + (settlementCount === 1 ? '' : 's') : '') +
        '. This cannot be undone.',
      confirmLabel: 'Delete group',
      danger: true,
      onConfirm: function () {
        try {
          Store.deleteGroup(groupId);
          toast('Group deleted.', 'success');
          refreshAll();
        } catch (error) {
          toast(error.message, 'error');
        }
      }
    });
  }

  function confirmDeleteSettlement(settlementId) {
    var state = currentState();
    var settlement = state.settlements.find(function (item) { return item.id === settlementId; });
    if (!settlement) {
      toast('Payment not found.', 'error');
      return;
    }
    var group = Store.getGroup(settlement.groupId);

    confirmDialog({
      title: 'Delete this recorded payment?',
      message: 'The ' + money(settlement.amount) + ' payment from <strong>' +
        esc(memberName(group, settlement.from)) + '</strong> to <strong>' +
        esc(memberName(group, settlement.to)) + '</strong> will be removed and balances recalculated.',
      confirmLabel: 'Delete payment',
      danger: true,
      onConfirm: function () {
        try {
          Store.deleteSettlement(settlementId);
          toast('Recorded payment removed.', 'success');
          refreshAll();
        } catch (error) {
          toast(error.message, 'error');
        }
      }
    });
  }

  function exportData() {
    try {
      var blob = new Blob([Store.exportJSON()], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'hisaab-backup-' + Core.todayISO() + '.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast('JSON backup downloaded.', 'success');
    } catch (error) {
      toast('Could not export the backup.', 'error');
    }
  }

  function loadDemoData() {
    var state = currentState();
    var hasData = state.groups.length || state.expenses.length || state.settlements.length;

    confirmDialog({
      title: hasData ? 'Replace with sample data?' : 'Load sample data?',
      message: hasData
        ? 'This will replace your current groups, expenses and payments with four sample groups. Your profile and currency stay the same.'
        : 'This adds four sample groups, their expenses and a recorded payment so you can explore every feature. You can clear it at any time.',
      confirmLabel: hasData ? 'Replace data' : 'Load sample data',
      onConfirm: function () {
        try {
          Store.addDemoData();
          toast('Sample data loaded.', 'success');
          ui.search = '';
          if (els.search) els.search.value = '';
          navigate('dashboard');
          renderNotifications();
        } catch (error) {
          toast(error.message, 'error');
        }
      }
    });
  }

  function clearAllData() {
    confirmDialog({
      title: 'Clear all HISAAB data?',
      message: 'Every group, expense and recorded payment will be permanently removed from this browser. Your profile and currency will be kept.',
      confirmLabel: 'Clear everything',
      danger: true,
      onConfirm: function () {
        try {
          Store.clearFinancialData();
          toast('All financial data cleared.', 'success');
          ui.search = '';
          if (els.search) els.search.value = '';
          navigate('dashboard');
          renderNotifications();
        } catch (error) {
          toast(error.message, 'error');
        }
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Calendar + small modal actions                                     */
  /* ------------------------------------------------------------------ */

  function changeCalendar(offset) {
    ui.calendar.month += offset;
    if (ui.calendar.month > 11) {
      ui.calendar.month = 0;
      ui.calendar.year += 1;
    } else if (ui.calendar.month < 0) {
      ui.calendar.month = 11;
      ui.calendar.year -= 1;
    }
    ui.calendar.selected = Core.toISODate(new Date(ui.calendar.year, ui.calendar.month, 1));
    renderRightPanel();
  }

  function selectCalendarDay(isoDate) {
    var date = Core.parseISODate(isoDate);
    if (!date) return;
    ui.calendar.selected = isoDate;
    ui.calendar.year = date.getFullYear();
    ui.calendar.month = date.getMonth();
    renderRightPanel();
  }

  function addMemberRow() {
    var rows = $('#memberRows');
    if (!rows) return;
    if (rows.children.length >= 19) {
      toast('A group can have up to 20 members including you.', 'info');
      return;
    }
    rows.insertAdjacentHTML('beforeend', memberRowHTML(''));
    var inputs = $$('.member-name', rows);
    if (inputs.length) inputs[inputs.length - 1].focus();
  }

  function removeMemberRow(button) {
    var rows = $('#memberRows');
    if (!rows) return;
    var row = button.closest('.member-row');
    if (!row) return;
    if (rows.children.length <= 1) {
      var input = $('.member-name', row);
      if (input) {
        input.value = '';
        input.focus();
      }
      return;
    }
    row.parentNode.removeChild(row);
  }

  function toggleAllParticipants(checked) {
    $$('#participantList input[data-participant]').forEach(function (checkbox) {
      checkbox.checked = checked;
    });
    updateParticipantCount();
  }

  /* ------------------------------------------------------------------ */
  /* Action dispatcher                                                  */
  /* ------------------------------------------------------------------ */

  function handleAction(element, event) {
    var action = element.getAttribute('data-action');

    switch (action) {
      case 'toggle-bell':
        toggleDropdown('bell');
        break;
      case 'toggle-profile':
        toggleDropdown('profile');
        break;
      case 'close-modal':
        closeModal();
        break;
      case 'new-group':
        closeDropdowns();
        openGroupModal();
        break;
      case 'demo-data':
        closeDropdowns();
        loadDemoData();
        break;
      case 'export-data':
        closeDropdowns();
        exportData();
        break;
      case 'clear-data':
        closeDropdowns();
        clearAllData();
        break;
      case 'new-expense':
        closeDropdowns();
        openExpenseModal({ groupId: element.getAttribute('data-group-id') || null });
        break;
      case 'edit-expense':
        openExpenseModal({ expenseId: element.getAttribute('data-id') });
        break;
      case 'delete-expense':
        confirmDeleteExpense(element.getAttribute('data-id'));
        break;
      case 'delete-group':
        confirmDeleteGroup(element.getAttribute('data-id'));
        break;
      case 'delete-settlement':
        confirmDeleteSettlement(element.getAttribute('data-id'));
        break;
      case 'record-settlement':
        closeDropdowns();
        openSettlementModal({
          groupId: element.getAttribute('data-group-id'),
          from: element.getAttribute('data-from'),
          to: element.getAttribute('data-to'),
          amount: Number(element.getAttribute('data-amount'))
        });
        break;
      case 'settle-group':
        openSettlementModal({ groupId: element.getAttribute('data-id') || ui.activeGroupId });
        break;
      case 'calendar-prev':
        changeCalendar(-1);
        break;
      case 'calendar-next':
        changeCalendar(1);
        break;
      case 'calendar-day':
        selectCalendarDay(element.getAttribute('data-date'));
        break;
      case 'add-member':
        addMemberRow();
        break;
      case 'remove-member':
        removeMemberRow(element);
        break;
      case 'select-all-participants':
        toggleAllParticipants(true);
        break;
      case 'clear-participants':
        toggleAllParticipants(false);
        break;
      case 'reset-expense-filter':
        ui.expenseGroupFilter = 'all';
        ui.search = '';
        if (els.search) els.search.value = '';
        renderExpenses();
        break;
      case 'view-group-expenses':
        if (element.getAttribute('data-id')) ui.expenseGroupFilter = element.getAttribute('data-id');
        navigate('expenses');
        break;
      default:
        break;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Form submissions                                                   */
  /* ------------------------------------------------------------------ */

  function handleSubmit(event) {
    var form = event.target;
    if (!form || !form.id) return;

    if (form.id === 'groupForm') {
      event.preventDefault();
      hideFormError('groupFormError');
      var memberNames = $$('#memberRows .member-name').map(function (input) { return input.value; });
      try {
        var group = Store.createGroup(document.getElementById('groupName').value, memberNames);
        closeModal();
        toast('Group “' + group.name + '” created.', 'success');
        navigate('group', { groupId: group.id });
      } catch (error) {
        showFormError('groupFormError', error.message);
      }
      return;
    }

    if (form.id === 'expenseForm') {
      event.preventDefault();
      hideFormError('expenseFormError');
      var expenseId = document.getElementById('expenseId').value;
      var participants = $$('#participantList input[data-participant]:checked').map(function (input) {
        return input.value;
      });
      var payload = {
        description: document.getElementById('expenseDescription').value,
        amount: Number(document.getElementById('expenseAmount').value),
        groupId: document.getElementById('expenseGroupSelect').value,
        paidBy: document.getElementById('expensePayerSelect').value,
        date: document.getElementById('expenseDate').value,
        participants: participants
      };

      try {
        if (expenseId) {
          Store.updateExpense(expenseId, payload);
          toast('Expense updated.', 'success');
        } else {
          Store.addExpense(payload);
          toast('Expense added.', 'success');
        }
        closeModal();
        refreshAll();
      } catch (error) {
        showFormError('expenseFormError', error.message);
      }
      return;
    }

    if (form.id === 'settlementForm') {
      event.preventDefault();
      hideFormError('settlementFormError');

      var settlementGroupId = document.getElementById('settlementGroupSelect').value;
      var fromId = document.getElementById('settlementFrom').value;
      var toId = document.getElementById('settlementTo').value;
      var settlementAmount = Number(document.getElementById('settlementAmount').value);
      var settlementDate = document.getElementById('settlementDate').value;
      var group = Store.getGroup(settlementGroupId);

      try {
        if (!group) throw new Error('Choose a valid group.');
        if (!fromId || !toId) throw new Error('Choose who paid and who received the money.');
        if (fromId === toId) throw new Error('A person cannot pay themselves.');

        var net = getNet(group);
        var debt = -(net[fromId] || 0);
        var credit = net[toId] || 0;
        var maximum = Core.roundMoney(Math.min(Math.max(0, debt), Math.max(0, credit)));

        if (maximum <= EPS) throw new Error('These members have no outstanding balance between them.');
        if (!isFinite(settlementAmount) || settlementAmount <= 0) throw new Error('Enter a payment amount greater than zero.');
        if (settlementAmount > maximum + EPS) {
          throw new Error('The most that can be settled between them is ' + money(maximum) + '.');
        }

        Store.addSettlement({
          groupId: settlementGroupId,
          from: fromId,
          to: toId,
          amount: settlementAmount,
          date: settlementDate
        });
        closeModal();
        toast('Payment recorded. Balances updated.', 'success');
        refreshAll();
      } catch (error) {
        showFormError('settlementFormError', error.message);
      }
      return;
    }

    if (form.id === 'settingsForm') {
      event.preventDefault();
      hideFormError('settingsError');
      try {
        Store.updateProfile({
          name: document.getElementById('settingsName').value,
          currency: document.getElementById('settingsCurrency').value
        });
        toast('Profile updated.', 'success');
        refreshAll();
      } catch (error) {
        showFormError('settingsError', error.message);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Global event handling                                              */
  /* ------------------------------------------------------------------ */

  function handleDocumentClick(event) {
    var nav = event.target.closest('[data-nav]');
    if (nav) {
      event.preventDefault();
      navigate(nav.getAttribute('data-nav'));
      return;
    }

    var actionElement = event.target.closest('[data-action]');
    if (actionElement) {
      event.preventDefault();
      handleAction(actionElement, event);
      if (!event.target.closest('.tool-wrap')) closeDropdowns();
      return;
    }

    var groupElement = event.target.closest('[data-open-group]');
    if (groupElement) {
      event.preventDefault();
      closeDropdowns();
      navigate('group', { groupId: groupElement.getAttribute('data-open-group') });
      return;
    }

    if (!event.target.closest('.tool-wrap')) closeDropdowns();
  }

  function handleInput(event) {
    if (event.target.id !== 'globalSearch') return;
    ui.search = event.target.value.trim();
    if (ui.view === 'dashboard' || ui.view === 'groups' || ui.view === 'expenses' ||
        ui.view === 'settlements' || ui.view === 'group') {
      renderMain();
    }
  }

  function handleChange(event) {
    var target = event.target;
    var id = target.id;

    if (id === 'expenseGroupSelect') {
      populateExpenseMembers(target.value, null);
    } else if (id === 'settlementGroupSelect') {
      populateSettlementMembers(target.value, null);
    } else if (id === 'settlementFrom' || id === 'settlementTo') {
      updateSettlementSuggestion();
    } else if (id === 'expenseGroupFilter') {
      ui.expenseGroupFilter = target.value;
      renderMain();
    } else if (id === 'settlementGroupFilter') {
      ui.settlementGroupFilter = target.value;
      renderMain();
    } else if (target.matches('[data-participant]')) {
      updateParticipantCount();
    }
  }

  function handleKeydown(event) {
    var modal = els.modalRoot ? els.modalRoot.querySelector('.modal') : null;

    if (event.key === 'Escape') {
      if (modal) {
        closeModal();
        return;
      }
      closeDropdowns();
      return;
    }

    if (event.key === '/' && !modal) {
      var tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (tag !== 'input' && tag !== 'textarea' && tag !== 'select' && els.search && !els.search.disabled) {
        event.preventDefault();
        els.search.focus();
      }
      return;
    }

    if (event.key === 'Tab' && modal) {
      var focusables = $$('button, input, select, textarea, a[href]', modal).filter(function (item) {
        return !item.disabled && item.offsetParent !== null;
      });
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }

    if ((event.key === 'Enter' || event.key === ' ') && document.activeElement &&
        document.activeElement.matches('[data-open-group]') &&
        document.activeElement.tagName !== 'BUTTON') {
      event.preventDefault();
      navigate('group', { groupId: document.activeElement.getAttribute('data-open-group') });
    }
  }

  function handleWindowStorage(event) {
    if (event.key !== Store.storageKey) return;
    Store.reload();
    toast('Data refreshed from another tab.', 'info');
    refreshAll();
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                               */
  /* ------------------------------------------------------------------ */

  function init() {
    els = {
      pageKicker: document.getElementById('pageKicker'),
      pageTitle: document.getElementById('pageTitle'),
      pageSubtitle: document.getElementById('pageSubtitle'),
      search: document.getElementById('globalSearch'),
      profileAvatar: document.getElementById('profileAvatar'),
      profileName: document.getElementById('profileName'),
      dropdownAvatar: document.getElementById('dropdownAvatar'),
      dropdownName: document.getElementById('dropdownName'),
      dropdownCurrency: document.getElementById('dropdownCurrency'),
      bellButton: document.getElementById('bellButton'),
      bellDropdown: document.getElementById('bellDropdown'),
      bellDropdownBody: document.getElementById('bellDropdownBody'),
      bellDot: document.getElementById('bellDot'),
      bellCount: document.getElementById('bellCount'),
      profileButton: document.getElementById('profileButton'),
      profileDropdown: document.getElementById('profileDropdown'),
      mainContent: document.getElementById('mainContent'),
      rightPanel: document.getElementById('rightPanel'),
      viewScroll: document.getElementById('viewScroll'),
      toastRoot: document.getElementById('toastRoot'),
      modalRoot: document.getElementById('modalRoot')
    };

    var today = new Date();
    ui.calendar.year = today.getFullYear();
    ui.calendar.month = today.getMonth();
    ui.calendar.selected = Core.todayISO();

    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('input', handleInput);
    document.addEventListener('change', handleChange);
    document.addEventListener('submit', handleSubmit);
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('storage', handleWindowStorage);

    navigate('dashboard');

    if (!Store.storageInfo().persistent) {
      toast('Local Storage is unavailable in this browser. Changes will not survive a refresh.', 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
