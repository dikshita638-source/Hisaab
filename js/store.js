/*
 * HISAAB — store.js
 * Owns the application state, validation and Local Storage persistence.
 * Every create / edit / delete operation goes through this file.
 */
(function (global) {
  'use strict';

  var Core = global.HisaabCore;
  var STORAGE_KEY = 'hisaab_data_v1';
  var ME = 'me';
  var persistent = true;
  var state = loadState();

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

  function normalizeState(raw) {
    var data = raw && typeof raw === 'object' ? raw : {};
    var profile = data.profile && typeof data.profile === 'object' ? data.profile : {};
    var currency = Core.CURRENCIES[profile.currency] ? profile.currency : 'INR';

    var groups = Array.isArray(data.groups) ? data.groups.filter(function (group) {
      return group && typeof group === 'object' && group.id && group.name && Array.isArray(group.members);
    }).map(function (group) {
      var seen = {};
      var members = group.members.filter(function (member) {
        if (!member || !member.id || !cleanName(member.name)) return false;
        if (seen[member.id]) return false;
        seen[member.id] = true;
        return true;
      }).map(function (member) {
        return { id: String(member.id), name: cleanName(member.name, 40) };
      });

      return {
        id: String(group.id),
        name: cleanName(group.name, 60),
        createdAt: group.createdAt || new Date().toISOString(),
        members: members
      };
    }).filter(function (group) {
      return group.members.length >= 2;
    }) : [];

    var validGroupIds = {};
    var validMemberIds = {};
    groups.forEach(function (group) {
      validGroupIds[group.id] = true;
      group.members.forEach(function (member) { validMemberIds[member.id] = true; });
    });

    var expenses = Array.isArray(data.expenses) ? data.expenses.filter(function (expense) {
      return expense && typeof expense === 'object' &&
        validGroupIds[expense.groupId] &&
        validMemberIds[expense.paidBy] &&
        Core.isValidISODate(expense.date) &&
        isFinite(Number(expense.amount)) && Number(expense.amount) > 0 &&
        Array.isArray(expense.participants);
    }).map(function (expense) {
      var participants = [];
      expense.participants.forEach(function (id) {
        if (validMemberIds[id] && participants.indexOf(id) === -1) participants.push(String(id));
      });
      return {
        id: String(expense.id || Core.uid('exp')),
        groupId: String(expense.groupId),
        description: cleanName(expense.description, 90),
        amount: Core.roundMoney(expense.amount),
        paidBy: String(expense.paidBy),
        date: expense.date,
        participants: participants,
        createdAt: expense.createdAt || new Date().toISOString()
      };
    }).filter(function (expense) {
      return expense.description && expense.participants.length > 0;
    }) : [];

    var settlements = Array.isArray(data.settlements) ? data.settlements.filter(function (settlement) {
      return settlement && typeof settlement === 'object' &&
        validGroupIds[settlement.groupId] &&
        validMemberIds[settlement.from] &&
        validMemberIds[settlement.to] &&
        settlement.from !== settlement.to &&
        isFinite(Number(settlement.amount)) && Number(settlement.amount) > 0 &&
        Core.isValidISODate(settlement.date);
    }).map(function (settlement) {
      return {
        id: String(settlement.id || Core.uid('set')),
        groupId: String(settlement.groupId),
        from: String(settlement.from),
        to: String(settlement.to),
        amount: Core.roundMoney(settlement.amount),
        date: settlement.date,
        createdAt: settlement.createdAt || new Date().toISOString()
      };
    }) : [];

    return {
      version: 1,
      profile: {
        name: cleanName(profile.name, 40) || 'Aarav',
        currency: currency
      },
      groups: groups,
      expenses: expenses,
      settlements: settlements
    };
  }

  function loadState() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return createDefaultState();
      return normalizeState(JSON.parse(raw));
    } catch (error) {
      // Private browsing or file:// restrictions can disable Local Storage.
      persistent = false;
      console.warn('HISAAB: Local Storage is unavailable.', error);
      return createDefaultState();
    }
  }

  function persist() {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      persistent = true;
      return true;
    } catch (error) {
      persistent = false;
      console.warn('HISAAB: could not save data.', error);
      return false;
    }
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

  function createGroup(name, memberNames) {
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

    var group = {
      id: Core.uid('grp'),
      name: groupName,
      createdAt: new Date().toISOString(),
      members: [{ id: ME, name: state.profile.name }].concat(names.map(function (memberName) {
        return { id: Core.uid('mem'), name: memberName };
      }))
    };

    state.groups.unshift(group);
    persist();
    return group;
  }

  function deleteGroup(groupId) {
    var group = getGroup(groupId);
    if (!group) throw new Error('Group not found.');

    state.groups = state.groups.filter(function (item) { return item.id !== groupId; });
    state.expenses = state.expenses.filter(function (expense) { return expense.groupId !== groupId; });
    state.settlements = state.settlements.filter(function (settlement) { return settlement.groupId !== groupId; });
    persist();
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

  function addExpense(input) {
    var clean = normalizeExpenseInput(input);
    var expense = {
      id: Core.uid('exp'),
      groupId: clean.groupId,
      description: clean.description,
      amount: clean.amount,
      paidBy: clean.paidBy,
      date: clean.date,
      participants: clean.participants,
      createdAt: new Date().toISOString()
    };

    state.expenses.push(expense);
    persist();
    return expense;
  }

  function updateExpense(expenseId, input) {
    var expense = state.expenses.find(function (item) { return item.id === expenseId; });
    if (!expense) throw new Error('Expense not found.');

    var clean = normalizeExpenseInput(input);
    expense.groupId = clean.groupId;
    expense.description = clean.description;
    expense.amount = clean.amount;
    expense.paidBy = clean.paidBy;
    expense.date = clean.date;
    expense.participants = clean.participants;
    persist();
    return expense;
  }

  function deleteExpense(expenseId) {
    var expense = state.expenses.find(function (item) { return item.id === expenseId; });
    if (!expense) throw new Error('Expense not found.');

    state.expenses = state.expenses.filter(function (item) { return item.id !== expenseId; });
    persist();
    return expense;
  }

  function addSettlement(input) {
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

    var settlement = {
      id: Core.uid('set'),
      groupId: group.id,
      from: input.from,
      to: input.to,
      amount: amount,
      date: input.date,
      createdAt: new Date().toISOString()
    };

    state.settlements.push(settlement);
    persist();
    return settlement;
  }

  function deleteSettlement(settlementId) {
    var settlement = state.settlements.find(function (item) { return item.id === settlementId; });
    if (!settlement) throw new Error('Payment not found.');

    state.settlements = state.settlements.filter(function (item) { return item.id !== settlementId; });
    persist();
    return settlement;
  }

  function updateProfile(input) {
    var name = cleanName(input.name, 40);
    if (!name) throw new Error('Please enter your name.');
    if (!Core.CURRENCIES[input.currency]) throw new Error('Choose a supported currency.');

    state.profile.name = name;
    state.profile.currency = input.currency;

    // The current user is stored in every group, so keep those names in sync.
    state.groups.forEach(function (group) {
      group.members.forEach(function (member) {
        if (member.id === ME) member.name = name;
      });
    });

    persist();
    return state.profile;
  }

  function clearFinancialData() {
    state.groups = [];
    state.expenses = [];
    state.settlements = [];
    persist();
  }

  function addDemoData() {
    var today = Core.todayISO();
    var me = { id: ME, name: state.profile.name };

    function member(name) {
      return { id: Core.uid('mem'), name: name };
    }

    function group(name, people, daysAgo) {
      return {
        id: Core.uid('grp'),
        name: name,
        createdAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
        members: [me].concat(people.map(member))
      };
    }

    function expense(group, description, amount, paidBy, participants, dayOffset) {
      return {
        id: Core.uid('exp'),
        groupId: group.id,
        description: description,
        amount: amount,
        paidBy: paidBy,
        date: Core.addDaysISO(dayOffset),
        participants: participants,
        createdAt: new Date(Date.now() + dayOffset * 86400000).toISOString()
      };
    }

    var goa = group('Goa Trip 2026', ['Riya', 'Kabir', 'Meera'], 18);
    var flat = group('Flat 402', ['Rohan', 'Sneha'], 96);
    var office = group('Office Lunch Club', ['Priya', 'Arjun', 'Nisha'], 42);
    var diwali = group('Diwali Party', ['Aditya', 'Tara'], 24);

    var goaIds = goa.members.map(function (item) { return item.id; });
    var flatIds = flat.members.map(function (item) { return item.id; });
    var officeIds = office.members.map(function (item) { return item.id; });
    var diwaliIds = diwali.members.map(function (item) { return item.id; });

    state.groups = [goa, flat, office, diwali];

    state.expenses = [
      expense(goa, 'Beach shack dinner', 3200, me.id, goaIds, -2),
      expense(goa, 'Villa booking', 12000, goa.members[2].id, goaIds, -9),
      expense(goa, 'Water sports', 4800, goa.members[3].id,
        [me.id, goa.members[2].id, goa.members[3].id], -1),
      expense(goa, 'Cab to airport', 1200, goa.members[1].id, goaIds, -4),
      expense(goa, 'Sunset cruise deposit', 2400, me.id, goaIds, 2),

      expense(flat, 'Electricity bill', 3600, flat.members[1].id, flatIds, -3),
      expense(flat, 'Internet recharge', 999, me.id, flatIds, -7),
      expense(flat, 'Cleaning supplies', 740, flat.members[2].id, flatIds, -5),

      expense(office, 'Team lunch', 2200, office.members[1].id, officeIds, -1),
      expense(office, 'Coffee run', 680, me.id, [me.id, office.members[1].id, office.members[2].id], 0),
      expense(office, 'Birthday cake', 1300, office.members[3].id, officeIds, -6),

      expense(diwali, 'Decorations', 1850, diwali.members[1].id, diwaliIds, -8),
      expense(diwali, 'Snacks & sweets', 3200, me.id, diwaliIds, -3)
    ];

    state.settlements = [{
      id: Core.uid('set'),
      groupId: flat.id,
      from: me.id,
      to: flat.members[1].id,
      amount: 800,
      date: Core.addDaysISO(-2),
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString()
    }];

    persist();
    return { groups: state.groups.length, expenses: state.expenses.length, today: today };
  }

  function exportJSON() {
    return JSON.stringify(state, null, 2);
  }

  function reload() {
    state = loadState();
    return state;
  }

  function storageInfo() {
    var serialized = '';
    try { serialized = JSON.stringify(state); } catch (error) { serialized = ''; }
    return {
      persistent: persistent,
      key: STORAGE_KEY,
      bytes: serialized.length,
      groupCount: state.groups.length,
      expenseCount: state.expenses.length,
      settlementCount: state.settlements.length
    };
  }

  global.HisaabStore = {
    ME: ME,
    storageKey: STORAGE_KEY,
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
