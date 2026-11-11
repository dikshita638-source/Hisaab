(function (global) {
  'use strict';

  var Core = global.HisaabCore;
  var API_BASE = (global.HISAAB_API_BASE || 'https://hisaab-1-3pyv.onrender.com/api').replace(/\/+$/, '');
  var ME = 'me';
  var connected = false;
  var state = createDefaultState();

  function createDefaultState() {
    return {
      version: 1,
      profile: { name: 'Aarav', currency: 'INR' },
      groups: [],
      expenses: [],
      settlements: []
    };
  }

  function cleanName(value, maxLength) {
    return String(value == null ? '' : value)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength || 60);
  }

  async function request(path, options) {
    var opts = options || {};
    var config = {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' }
    };

    if (opts.body != null) {
      config.body = JSON.stringify(opts.body);
    }

    var response;
    try {
      response = await global.fetch(API_BASE + path, config);
    } catch (error) {
      connected = false;
      throw new Error('Could not reach the HISAAB server.');
    }

    var text = await response.text();
    var data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        data = null;
      }
    }

    if (!response.ok) {
      var message = data && (data.message || data.error);
      throw new Error(message || ('Request failed with status ' + response.status + '.'));
    }

    connected = true;
    return data;
  }

  function mapProfile(profile) {
    var data = profile && typeof profile === 'object' ? profile : {};
    var currency = Core.CURRENCIES[data.currency] ? data.currency : 'INR';
    return {
      name: cleanName(data.displayName, 40) || 'Aarav',
      currency: currency
    };
  }

  function mapGroup(group) {
    var members = (group.members || []).map(function (member) {
      return {
        id: String(member.id),
        backendId: member.id,
        name: cleanName(member.name, 40),
        currentUser: member.currentUser === true
      };
    });

    var current = members.find(function (member) { return member.currentUser; });
    if (!current) {
      var profileName = state.profile.name.toLowerCase();
      current = members.find(function (member) {
        return member.name.toLowerCase() === profileName;
      });
    }

    if (current) {
      members.forEach(function (member) {
        member.id = member === current ? ME : String(member.backendId);
        member.currentUser = member === current;
      });
    }

    return {
      id: String(group.id),
      name: cleanName(group.name, 60),
      description: group.description || '',
      inviteCode: group.inviteCode || '',
      createdAt: group.createdAt || new Date().toISOString(),
      members: members
    };
  }

  function frontendMemberId(group, backendId) {
    var member = group.members.find(function (item) {
      return String(item.backendId) === String(backendId);
    });
    return member ? member.id : String(backendId);
  }

  function mapExpense(expense, group) {
    var participants = [];
    (expense.shares || []).forEach(function (share) {
      var id = frontendMemberId(group, share.memberId);
      if (participants.indexOf(id) === -1) participants.push(id);
    });

    return {
      id: String(expense.id),
      groupId: String(expense.groupId),
      description: cleanName(expense.description, 90),
      amount: Core.roundMoney(expense.amount),
      paidBy: frontendMemberId(group, expense.paidByMemberId),
      date: expense.expenseDate,
      participants: participants,
      createdAt: expense.createdAt || new Date().toISOString()
    };
  }

  function mapPayment(payment, group) {
    return {
      id: String(payment.id),
      groupId: String(payment.groupId),
      from: frontendMemberId(group, payment.fromMemberId),
      to: frontendMemberId(group, payment.toMemberId),
      amount: Core.roundMoney(payment.amount),
      date: payment.paymentDate,
      createdAt: payment.createdAt || new Date().toISOString()
    };
  }

  function buildState(profile, entries) {
    var groups = entries.map(function (entry) { return mapGroup(entry.group); });
    var groupById = {};
    groups.forEach(function (group) { groupById[group.id] = group; });

    var expenses = [];
    var settlements = [];

    entries.forEach(function (entry) {
      var group = groupById[String(entry.group.id)];
      if (!group) return;

      (entry.expenses || []).forEach(function (expense) {
        var mapped = mapExpense(expense, group);
        if (mapped.description && mapped.participants.length) {
          expenses.push(mapped);
        }
      });

      (entry.payments || []).forEach(function (payment) {
        settlements.push(mapPayment(payment, group));
      });
    });

    return {
      version: 1,
      profile: mapProfile(profile),
      groups: groups,
      expenses: expenses,
      settlements: settlements
    };
  }

  async function loadAll() {
    var profile = await request('/profile');
    state.profile = mapProfile(profile);

    var groups = await request('/groups');
    var entries = await Promise.all((groups || []).map(async function (group) {
      var results = await Promise.all([
        request('/groups/' + group.id + '/expenses'),
        request('/groups/' + group.id + '/payments')
      ]);
      return { group: group, expenses: results[0] || [], payments: results[1] || [] };
    }));

    state = buildState(profile, entries);
    return state;
  }

  async function init() {
    return loadAll();
  }

  function getState() {
    return state;
  }

  function getGroup(groupId) {
    return state.groups.find(function (group) { return group.id === groupId; }) || null;
  }

  function getGroupExpenses(groupId) {
    return state.expenses.filter(function (expense) { return expense.groupId === groupId; });
  }

  function getGroupSettlements(groupId) {
    return state.settlements.filter(function (settlement) { return settlement.groupId === groupId; });
  }

  function backendMemberId(group, memberId) {
    var member = group.members.find(function (item) { return item.id === memberId; });
    if (!member) throw new Error('Choose a valid member.');
    return member.backendId;
  }

  async function postMember(groupId, name, currentUser) {
    return request('/groups/' + groupId + '/members', {
      method: 'POST',
      body: { name: name, currentUser: !!currentUser }
    });
  }

  async function createGroupThroughApi(groupName, memberNames) {
    var group = await request('/groups', {
      method: 'POST',
      body: { name: groupName }
    });

    try {
      await postMember(group.id, state.profile.name, true);
      for (var i = 0; i < memberNames.length; i++) {
        await postMember(group.id, memberNames[i], false);
      }
    } catch (error) {
      try {
        await request('/groups/' + group.id, { method: 'DELETE' });
      } catch (ignored) {
        // The original error is more useful.
      }
      throw error;
    }

    return group;
  }

  async function createGroup(name, memberNames) {
    var groupName = cleanName(name, 60);
    if (!groupName) throw new Error('Please enter a group name.');

    var names = [];
    (memberNames || []).forEach(function (rawName) {
      var memberName = cleanName(rawName, 40);
      if (!memberName) return;
      var duplicate = names.some(function (existing) {
        return existing.toLowerCase() === memberName.toLowerCase();
      });
      if (duplicate) throw new Error('Member names must be unique.');
      names.push(memberName);
    });

    if (!names.length) throw new Error('Add at least one other member.');

    var profileDuplicate = names.some(function (memberName) {
      return memberName.toLowerCase() === state.profile.name.toLowerCase();
    });
    if (profileDuplicate) throw new Error('You are already added to the group automatically.');

    if (names.length > 19) throw new Error('A group can have a maximum of 20 members.');

    var created = await createGroupThroughApi(groupName, names);
    await loadAll();
    return getGroup(String(created.id));
  }

  async function deleteGroup(groupId) {
    var group = getGroup(groupId);
    if (!group) throw new Error('Group not found.');

    await request('/groups/' + groupId, { method: 'DELETE' });
    await loadAll();
    return group;
  }

  function normalizeExpenseInput(input) {
    var group = getGroup(input.groupId);
    if (!group) throw new Error('Choose a valid group.');

    var description = cleanName(input.description, 90);
    if (!description) throw new Error('Please enter an expense description.');

    var amount = Core.roundMoney(Number(input.amount));
    if (!isFinite(amount) || amount <= 0) throw new Error('Enter an amount greater than zero.');

    if (!Core.isValidISODate(input.date)) throw new Error('Choose a valid date.');

    var memberIds = group.members.map(function (member) { return member.id; });
    if (memberIds.indexOf(input.paidBy) === -1) throw new Error('Choose who paid for this expense.');

    var participants = [];
    (input.participants || []).forEach(function (id) {
      if (memberIds.indexOf(id) !== -1 && participants.indexOf(id) === -1) {
        participants.push(id);
      }
    });
    if (!participants.length) throw new Error('Select at least one person to share this expense.');

    return {
      groupId: group.id,
      description: description,
      amount: amount,
      paidBy: input.paidBy,
      date: input.date,
      participants: participants
    };
  }

  function expenseBody(group, clean) {
    return {
      groupId: Number(group.id),
      description: clean.description,
      amount: clean.amount,
      paidByMemberId: backendMemberId(group, clean.paidBy),
      splitType: 'EQUAL',
      expenseDate: clean.date,
      shares: clean.participants.map(function (id) {
        return { memberId: backendMemberId(group, id) };
      })
    };
  }

  async function addExpense(input) {
    var clean = normalizeExpenseInput(input);
    var group = getGroup(clean.groupId);
    var expense = await request('/groups/' + group.id + '/expenses', {
      method: 'POST',
      body: expenseBody(group, clean)
    });

    await loadAll();
    return state.expenses.find(function (item) { return item.id === String(expense.id); }) || null;
  }

  async function updateExpense(expenseId, input) {
    var expense = state.expenses.find(function (item) { return item.id === expenseId; });
    if (!expense) throw new Error('Expense not found.');

    var clean = normalizeExpenseInput(input);
    var group = getGroup(clean.groupId);
    var saved = await request('/expenses/' + expenseId, {
      method: 'PUT',
      body: expenseBody(group, clean)
    });

    await loadAll();
    return state.expenses.find(function (item) { return item.id === String(saved.id); }) || null;
  }

  async function deleteExpense(expenseId) {
    var expense = state.expenses.find(function (item) { return item.id === expenseId; });
    if (!expense) throw new Error('Expense not found.');

    await request('/expenses/' + expenseId, { method: 'DELETE' });
    await loadAll();
    return expense;
  }

  async function addSettlement(input) {
    var group = getGroup(input.groupId);
    if (!group) throw new Error('Choose a valid group.');

    var memberIds = group.members.map(function (member) { return member.id; });
    if (memberIds.indexOf(input.from) === -1 || memberIds.indexOf(input.to) === -1) {
      throw new Error('Choose two members of the group.');
    }
    if (input.from === input.to) throw new Error('A person cannot pay themselves.');

    var amount = Core.roundMoney(Number(input.amount));
    if (!isFinite(amount) || amount <= 0) throw new Error('Enter a payment amount greater than zero.');
    if (!Core.isValidISODate(input.date)) throw new Error('Choose a valid payment date.');

    var payment = await request('/groups/' + group.id + '/payments', {
      method: 'POST',
      body: {
        fromMemberId: backendMemberId(group, input.from),
        toMemberId: backendMemberId(group, input.to),
        amount: amount,
        paymentDate: input.date
      }
    });

    await loadAll();
    return state.settlements.find(function (item) { return item.id === String(payment.id); }) || null;
  }

  async function deleteSettlement(settlementId) {
    var settlement = state.settlements.find(function (item) { return item.id === settlementId; });
    if (!settlement) throw new Error('Payment not found.');

    await request('/payments/' + settlementId, { method: 'DELETE' });
    await loadAll();
    return settlement;
  }

  async function updateProfile(input) {
    var name = cleanName(input.name, 40);
    if (!name) throw new Error('Please enter your name.');
    if (!Core.CURRENCIES[input.currency]) throw new Error('Choose a supported currency.');

    await request('/profile', {
      method: 'PUT',
      body: { displayName: name, currency: input.currency }
    });

    await loadAll();
    return state.profile;
  }

  async function clearFinancialData() {
    var groups = state.groups.slice();
    await Promise.all(groups.map(function (group) {
      return request('/groups/' + group.id, { method: 'DELETE' });
    }));
    await loadAll();
  }

  function memberIdByName(group, name) {
    if (name === ME) return ME;
    var member = group.members.find(function (item) {
      return item.name.toLowerCase() === String(name).toLowerCase();
    });
    return member ? member.id : null;
  }

  async function addDemoData() {
    var today = Core.todayISO();

    await clearFinancialData();

    var groupDefs = [
      { key: 'goa', name: 'Goa Trip 2026', people: ['Riya', 'Kabir', 'Meera'] },
      { key: 'flat', name: 'Flat 402', people: ['Rohan', 'Sneha'] },
      { key: 'office', name: 'Office Lunch Club', people: ['Priya', 'Arjun', 'Nisha'] },
      { key: 'diwali', name: 'Diwali Party', people: ['Aditya', 'Tara'] }
    ];

    var groups = {};
    for (var i = 0; i < groupDefs.length; i++) {
      groups[groupDefs[i].key] = await createGroup(groupDefs[i].name, groupDefs[i].people);
    }

    var expenseDefs = [
      ['goa', 'Beach shack dinner', 3200, ME, ['Riya', 'Kabir', 'Meera'], -2],
      ['goa', 'Villa booking', 12000, 'Kabir', ['Riya', 'Kabir', 'Meera'], -9],
      ['goa', 'Water sports', 4800, 'Meera', [ME, 'Kabir', 'Meera'], -1],
      ['goa', 'Cab to airport', 1200, 'Riya', ['Riya', 'Kabir', 'Meera'], -4],
      ['goa', 'Sunset cruise deposit', 2400, ME, ['Riya', 'Kabir', 'Meera'], 2],
      ['flat', 'Electricity bill', 3600, 'Rohan', ['Rohan', 'Sneha'], -3],
      ['flat', 'Internet recharge', 999, ME, ['Rohan', 'Sneha'], -7],
      ['flat', 'Cleaning supplies', 740, 'Sneha', ['Rohan', 'Sneha'], -5],
      ['office', 'Team lunch', 2200, 'Priya', ['Priya', 'Arjun', 'Nisha'], -1],
      ['office', 'Coffee run', 680, ME, [ME, 'Arjun', 'Nisha'], 0],
      ['office', 'Birthday cake', 1300, 'Nisha', ['Priya', 'Arjun', 'Nisha'], -6],
      ['diwali', 'Decorations', 1850, 'Aditya', ['Aditya', 'Tara'], -8],
      ['diwali', 'Snacks & sweets', 3200, ME, ['Aditya', 'Tara'], -3]
    ];

    for (var j = 0; j < expenseDefs.length; j++) {
      var def = expenseDefs[j];
      var group = groups[def[0]];
      var participants = def[4].map(function (name) {
        return memberIdByName(group, name);
      }).filter(Boolean);

      await addExpense({
        groupId: group.id,
        description: def[1],
        amount: def[2],
        paidBy: memberIdByName(group, def[3]),
        date: Core.addDaysISO(def[5]),
        participants: participants
      });
    }

    var flat = groups.flat;
    await addSettlement({
      groupId: flat.id,
      from: ME,
      to: memberIdByName(flat, 'Rohan'),
      amount: 800,
      date: Core.addDaysISO(-2)
    });

    await loadAll();
    return { groups: state.groups.length, expenses: state.expenses.length, today: today };
  }

  function exportJSON() {
    return JSON.stringify(state, null, 2);
  }

  function reload() {
    return loadAll();
  }

  function storageInfo() {
    var serialized = '';
    try { serialized = JSON.stringify(state); } catch (error) { serialized = ''; }
    return {
      persistent: connected,
      key: 'HISAAB API',
      bytes: serialized.length,
      groupCount: state.groups.length,
      expenseCount: state.expenses.length,
      settlementCount: state.settlements.length
    };
  }

  global.HisaabStore = {
    ME: ME,
    storageKey: 'HISAAB_API',
    init: init,
    getState: getState,
    getGroup: getGroup,
    getGroupExpenses: getGroupExpenses,
    getGroupSettlements: getGroupSettlements,
    createGroup: createGroup,
    deleteGroup: deleteGroup,
    addExpense: addExpense,
    updateExpense: updateExpense,
    deleteExpense: deleteExpense,
    addSettlement: addSettlement,
    deleteSettlement: deleteSettlement,
    updateProfile: updateProfile,
    clearFinancialData: clearFinancialData,
    addDemoData: addDemoData,
    exportJSON: exportJSON,
    reload: reload,
    storageInfo: storageInfo
  };
})(typeof window !== 'undefined' ? window : globalThis);
