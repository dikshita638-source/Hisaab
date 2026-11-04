/*
 * HISAAB — core.js
 * Pure helper functions: money, dates, expense splitting and settlement maths.
 * Nothing in this file touches the DOM or localStorage, which keeps the tricky
 * calculations easy to test on their own.
 */
(function (global) {
  'use strict';

  var EPSILON = 0.005; // anything smaller than half a paise is treated as zero

  var CURRENCIES = {
    INR: { symbol: '\u20B9', locale: 'en-IN' },
    USD: { symbol: '$', locale: 'en-US' },
    EUR: { symbol: '\u20AC', locale: 'de-DE' },
    GBP: { symbol: '\u00A3', locale: 'en-GB' }
  };

  function roundMoney(value) {
    var number = Number(value);
    if (!isFinite(number)) return 0;
    return Math.round((number + Number.EPSILON) * 100) / 100;
  }

  /*
   * Split an amount equally, in paise, so the individual shares always add
   * back up to the original amount. If the amount cannot be divided exactly,
   * the first few participants pay one extra paise.
   */
  function splitAmount(total, count) {
    var people = Math.max(0, Math.floor(Number(count) || 0));
    var totalPaise = Math.max(0, Math.round(Number(total) * 100));
    if (!people) return [];

    var base = Math.floor(totalPaise / people);
    var remainder = totalPaise - base * people;
    var shares = [];

    for (var i = 0; i < people; i++) {
      shares.push((base + (i < remainder ? 1 : 0)) / 100);
    }
    return shares;
  }

  /*
   * Work out who is owed money and who owes money inside one group.
   * Positive balance  = the member should receive money.
   * Negative balance  = the member owes money.
   */
  function calculateGroupNet(group, allExpenses, allSettlements) {
    var net = {};

    (group.members || []).forEach(function (member) {
      net[member.id] = 0;
    });

    (allExpenses || []).forEach(function (expense) {
      if (expense.groupId !== group.id) return;
      if (net[expense.paidBy] === undefined) return;

      var participants = [];
      (expense.participants || []).forEach(function (id) {
        if (net[id] !== undefined && participants.indexOf(id) === -1) {
          participants.push(id);
        }
      });
      if (!participants.length) return;

      var shares = splitAmount(expense.amount, participants.length);
      net[expense.paidBy] = roundMoney(net[expense.paidBy] + Number(expense.amount));

      participants.forEach(function (id, index) {
        net[id] = roundMoney(net[id] - shares[index]);
      });
    });

    // A recorded payment reduces the payer's debt and the receiver's credit.
    (allSettlements || []).forEach(function (settlement) {
      if (settlement.groupId !== group.id) return;
      if (net[settlement.from] === undefined || net[settlement.to] === undefined) return;

      net[settlement.from] = roundMoney(net[settlement.from] + Number(settlement.amount));
      net[settlement.to] = roundMoney(net[settlement.to] - Number(settlement.amount));
    });

    return net;
  }

  /*
   * Minimum-payment settlement plan.
   * Greedily pair the biggest debtor with the biggest creditor. Every payment
   * fully clears at least one person, so an N-person group needs at most N-1
   * payments instead of everybody paying everybody.
   */
  function minimizeSettlements(net) {
    var entries = Object.keys(net || {}).map(function (id) {
      return { id: id, amount: roundMoney(net[id]) };
    });

    var debtors = entries
      .filter(function (entry) { return entry.amount < -EPSILON; })
      .map(function (entry) { return { id: entry.id, amount: roundMoney(-entry.amount) }; })
      .sort(function (a, b) { return b.amount - a.amount || a.id.localeCompare(b.id); });

    var creditors = entries
      .filter(function (entry) { return entry.amount > EPSILON; })
      .map(function (entry) { return { id: entry.id, amount: entry.amount }; })
      .sort(function (a, b) { return b.amount - a.amount || a.id.localeCompare(b.id); });

    var payments = [];
    var debtorIndex = 0;
    var creditorIndex = 0;

    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
      var debtor = debtors[debtorIndex];
      var creditor = creditors[creditorIndex];
      var amount = roundMoney(Math.min(debtor.amount, creditor.amount));

      if (amount > EPSILON) {
        payments.push({ from: debtor.id, to: creditor.id, amount: amount });
      }

      debtor.amount = roundMoney(debtor.amount - amount);
      creditor.amount = roundMoney(creditor.amount - amount);

      if (debtor.amount <= EPSILON) debtorIndex++;
      if (creditor.amount <= EPSILON) creditorIndex++;
    }

    return payments;
  }

  function getCurrency(currencyCode) {
    return CURRENCIES[currencyCode] || CURRENCIES.INR;
  }

  function formatMoney(amount, currencyCode) {
    var currency = getCurrency(currencyCode);
    var number = roundMoney(Math.abs(Number(amount) || 0));
    var hasPaise = Math.abs(number % 1) > 0.0001;

    var formatted = new Intl.NumberFormat(currency.locale, {
      minimumFractionDigits: hasPaise ? 2 : 0,
      maximumFractionDigits: 2
    }).format(number);

    return (Number(amount) < 0 ? '-' : '') + currency.symbol + formatted;
  }

  function parseISODate(isoDate) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ''));
    if (!match) return null;

    var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (isNaN(date.getTime())) return null;

    // Reject impossible dates such as 2026-02-31.
    if (date.getFullYear() !== Number(match[1]) ||
        date.getMonth() !== Number(match[2]) - 1 ||
        date.getDate() !== Number(match[3])) {
      return null;
    }
    return date;
  }

  function isValidISODate(isoDate) {
    return parseISODate(isoDate) !== null;
  }

  function toISODate(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function todayISO() {
    return toISODate(new Date());
  }

  function addDaysISO(days, startDate) {
    var date = startDate ? new Date(startDate) : new Date();
    date.setDate(date.getDate() + Number(days || 0));
    return toISODate(date);
  }

  function formatDate(isoDate, style) {
    var date = parseISODate(isoDate) || new Date(isoDate);
    if (isNaN(date.getTime())) return '—';

    var options = style === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : { day: 'numeric', month: 'short', year: 'numeric' };

    return new Intl.DateTimeFormat('en-GB', options).format(date);
  }

  function formatShortDate(isoDate) {
    var date = parseISODate(isoDate);
    if (!date) return '—';
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date);
  }

  function formatRelativeDate(isoDate) {
    var date = parseISODate(isoDate);
    if (!date) return '—';

    var today = parseISODate(todayISO());
    var difference = Math.round((date - today) / 86400000);

    if (difference === 0) return 'Today';
    if (difference === -1) return 'Yesterday';
    if (difference === 1) return 'Tomorrow';
    return formatDate(isoDate);
  }

  function formatMonthYear(date) {
    return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(date);
  }

  function initials(name) {
    var words = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function uid(prefix) {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return (prefix || 'id') + '-' + global.crypto.randomUUID();
    }
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 8);
  }

  var Core = {
    EPSILON: EPSILON,
    CURRENCIES: CURRENCIES,
    roundMoney: roundMoney,
    splitAmount: splitAmount,
    calculateGroupNet: calculateGroupNet,
    minimizeSettlements: minimizeSettlements,
    getCurrency: getCurrency,
    formatMoney: formatMoney,
    parseISODate: parseISODate,
    isValidISODate: isValidISODate,
    toISODate: toISODate,
    todayISO: todayISO,
    addDaysISO: addDaysISO,
    formatDate: formatDate,
    formatShortDate: formatShortDate,
    formatRelativeDate: formatRelativeDate,
    formatMonthYear: formatMonthYear,
    initials: initials,
    escapeHtml: escapeHtml,
    uid: uid
  };

  global.HisaabCore = Core;

  // Enables the same functions to be tested with Node during development.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Core;
  }
})(typeof window !== 'undefined' ? window : globalThis);
