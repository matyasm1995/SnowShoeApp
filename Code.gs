var SPREADSHEET_ID = "1IIbTbdW2iXFpGfqyfWA1XspqtuNyXne0hloB9kRcCYE";
var MANAGER_NOTES_SPREADSHEET_ID = "18KZNOcoEvqWNqSMBZq9tGvSkVGnE180Yd-yV8V7-TjY";
var FORM_RESPONSE_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSet1ZR3f0FfgFLuB1IqgSPxjWaq72tMdtfks9EEpz__FYFeFA/formResponse";

var MAX_ROWS = 260;
var MAX_COLS = 120; // Covers staff columns BQ through CZ and ship column BB

var MONTH_NAMES = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
];

function computeMd5Hex(inputStr) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5,
    inputStr,
    Utilities.Charset.UTF_8
  );
  var hex = "";
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    if (b < 0) b += 256;
    var s = b.toString(16);
    if (s.length === 1) s = "0" + s;
    hex += s;
  }
  return hex;
}

function buildWindowDateSet(daysAhead) {
  var allowed = {};
  var now = new Date();
  // Include 2 days in the past (for yesterday's post-trip report) through daysAhead
  for (var offset = -2; offset <= daysAhead; offset++) {
    var d = new Date(now.getTime() + offset * 86400000);
    var monthIdx = parseInt(Utilities.formatDate(d, "Europe/Oslo", "M"), 10) - 1;
    var dayNum = parseInt(Utilities.formatDate(d, "Europe/Oslo", "d"), 10);
    var monthName = MONTH_NAMES[monthIdx] || "";
    if (monthName && dayNum > 0) {
      allowed[monthName + ":" + dayNum] = true;
    }
  }
  return allowed;
}

function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var isCompactV2 = String(params.v || "") === "2";
    var isLite = isCompactV2 && String(params.lite || "") === "1";
    var daysAhead = parseInt(params.days || "40", 10);
    if (!isFinite(daysAhead) || daysAhead < 7) daysAhead = 40;
    if (daysAhead > 90) daysAhead = 90;
    var clientHash = String(params.hash || "").trim();

    var liteCacheKey = "cal_lite_v2_" + daysAhead;
    if (isLite) {
      try {
        var cachedLite = CacheService.getScriptCache().get(liteCacheKey);
        if (cachedLite) {
          return ContentService
            .createTextOutput(cachedLite)
            .setMimeType(ContentService.MimeType.JSON);
        }
      } catch (cacheErr) {}
    }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheets()[0];

    if (!sheet) {
      throw new Error("First sheet not found in spreadsheet.");
    }

    var tabName = sheet.getName();
    var lastRow = Math.min(sheet.getLastRow(), MAX_ROWS);
    var lastCol = Math.min(sheet.getLastColumn(), MAX_COLS);

    var values = [];
    var notes = [];
    var backgrounds = [];
    var fontLines = [];

    if (lastRow > 0 && lastCol > 0) {
      var range = sheet.getRange(1, 1, lastRow, lastCol);
      values = range.getValues();
      fontLines = range.getFontLines();
      if (!isLite) {
        notes = range.getNotes();
        backgrounds = range.getBackgrounds();
      }
    }

    var comments = [];
    if (!isLite) {
      var result = Sheets.Spreadsheets.get(SPREADSHEET_ID, {
        commentsViewMode: "COMMENTS_VIEW_MODE_INCLUDED",
        fields:
          "comments(commentId,anchorId,status,plainTextQuote," +
          "headPost(postId,content,author(displayName,user,me)," +
          "createTime,updateTime)," +
          "replies(postId,content,author(displayName,user,me)," +
          "createTime,updateTime))," +
          "sheets(properties(sheetId,title)," +
          "commentAnchors(anchorId,range(sheetId,startRowIndex," +
          "endRowIndex,startColumnIndex,endColumnIndex)))"
      });

      var anchorMap = {};
      (result.sheets || []).forEach(function(s) {
        var sheetName = s.properties.title;
        (s.commentAnchors || []).forEach(function(anchor) {
          anchorMap[anchor.anchorId] = {
            sheet: sheetName,
            range: anchor.range
          };
        });
      });

      function columnLetter(n) {
        var letter = "";
        while (n > 0) {
          var remainder = (n - 1) % 26;
          letter = String.fromCharCode(65 + remainder) + letter;
          n = Math.floor((n - 1) / 26);
        }
        return letter;
      }

      function formatPost(post) {
        if (!post) return null;
        return {
          postId: post.postId || "",
          content: post.content || "",
          author: post.author ? post.author.displayName || "" : "",
          authorId: post.author ? post.author.user || "" : "",
          createdTime: post.createTime || "",
          updatedTime: post.updateTime || ""
        };
      }

      (result.comments || []).forEach(function(c) {
        var location = anchorMap[c.anchorId] || null;
        if (location && location.sheet !== tabName) {
          return;
        }

        var cell = null;
        var cellRange = null;
        var row = null;
        var column = null;

        if (location && location.range) {
          var r = location.range;
          var startRow = r.startRowIndex + 1;
          var endRow = r.endRowIndex;
          var startCol = r.startColumnIndex + 1;
          var endCol = r.endColumnIndex;

          var startCell = columnLetter(startCol) + startRow;
          var endCell = columnLetter(endCol) + endRow;

          cell = startCell === endCell ? startCell : startCell + ":" + endCell;
          cellRange = {
            startRow: startRow,
            endRow: endRow,
            startColumn: startCol,
            endColumn: endCol
          };
          row = startRow;
          column = startCol;
        }

        var headPost = formatPost(c.headPost);
        var replies = (c.replies || []).map(function(reply) {
          return formatPost(reply);
        });

        comments.push({
          commentId: c.commentId || "",
          comment: headPost ? headPost.content : "",
          author: headPost ? headPost.author : "",
          authorId: headPost ? headPost.authorId : "",
          createdTime: headPost ? headPost.createTime : "",
          updatedTime: headPost ? headPost.updateTime : "",
          status: c.status || "UNKNOWN",
          quotedText: c.plainTextQuote || "",
          sheet: location ? location.sheet : null,
          cell: cell,
          row: row,
          column: column,
          cellRange: cellRange,
          replyCount: replies.length,
          replies: replies
        });
      });
    }

    var managerNotes = [];
    if (!isLite) {
      try {
        var notesSs = SpreadsheetApp.openById(MANAGER_NOTES_SPREADSHEET_ID);
        var notesSheet = notesSs.getSheets()[0];
        if (notesSheet && notesSheet.getLastRow() > 0 && notesSheet.getLastColumn() > 0) {
          managerNotes = notesSheet
            .getRange(1, 1, notesSheet.getLastRow(), notesSheet.getLastColumn())
            .getDisplayValues();
        }
      } catch (notesErr) {
        managerNotes = [];
      }
    }

    // Compact v2 response: ~90-95% smaller payload + MD5 not_modified check
    if (isCompactV2) {
      var allowedDates = buildWindowDateSet(daysAhead);
      var keptIndices = [];
      var keptIndexSet = {};

      function keepRow(idx) {
        if (idx >= 0 && idx < values.length && !keptIndexSet[idx]) {
          keptIndexSet[idx] = true;
          keptIndices.push(idx);
        }
      }

      // Always keep header rows 0 and 1
      keepRow(0);
      keepRow(1);

      var currentMonth = "";
      var currentMonthHeaderIdx = -1;
      var matchedDateRows = 0;

      for (var ri = 2; ri < values.length; ri++) {
        var rowArr = values[ri] || [];
        var col0 = String(rowArr[0] || "").trim().toUpperCase();
        if (MONTH_NAMES.indexOf(col0) !== -1) {
          currentMonth = col0;
          currentMonthHeaderIdx = ri;
          continue;
        }
        var col1Day = parseInt(String(rowArr[1] || "").trim(), 10);
        if (currentMonth && col1Day > 0 && allowedDates[currentMonth + ":" + col1Day]) {
          if (currentMonthHeaderIdx !== -1) {
            keepRow(currentMonthHeaderIdx);
          }
          keepRow(ri);
          matchedDateRows++;
        }
      }

      // Fallback: if sheet date headers didn't match (e.g. off-season tab), include all rows
      if (matchedDateRows === 0) {
        for (var fi = 2; fi < values.length; fi++) {
          keepRow(fi);
        }
      }

      keptIndices.sort(function(a, b) { return a - b; });

      var origRow1ToCompactRow1 = {};
      var compactRows = [];

      for (var k = 0; k < keptIndices.length; k++) {
        var origIdx = keptIndices[k];
        origRow1ToCompactRow1[origIdx + 1] = k + 1;

        var vRow = values[origIdx] || [];
        var nRow = notes[origIdx] || [];
        var bRow = backgrounds[origIdx] || [];
        var fRow = fontLines[origIdx] || [];

        var sparseV = {};
        var sparseN = {};
        var sparseB = {};
        var strikeCols = [];
        var hasN = false;
        var hasB = false;

        for (var ci = 0; ci < lastCol; ci++) {
          var vVal = vRow[ci];
          if (vVal !== "" && vVal !== null && vVal !== undefined) {
            var vStr = String(vVal);
            if (vStr.length > 0) sparseV[ci] = vStr;
          }

          var nStr = String(nRow[ci] || "").trim();
          if (nStr.length > 0) {
            sparseN[ci] = nStr;
            hasN = true;
          }

          var bStr = String(bRow[ci] || "").trim().toLowerCase();
          if (bStr.length > 0 && bStr !== "#ffffff" && bStr !== "#fff") {
            sparseB[ci] = bStr;
            hasB = true;
          }

          var fStr = String(fRow[ci] || "").toLowerCase();
          if (fStr.indexOf("line-through") !== -1) {
            strikeCols.push(ci);
          }
        }

        var rowObj = { v: sparseV };
        if (hasN) rowObj.n = sparseN;
        if (hasB) rowObj.b = sparseB;
        if (strikeCols.length > 0) rowObj.f = strikeCols;
        compactRows.push(rowObj);
      }

      var compactComments = [];
      for (var cm = 0; cm < comments.length; cm++) {
        var item = comments[cm];
        var mappedRow = item.row ? origRow1ToCompactRow1[item.row] : null;
        if (!mappedRow) continue;
        compactComments.push({
          commentId: item.commentId,
          comment: item.comment,
          author: item.author,
          row: mappedRow,
          column: item.column,
          cell: item.cell,
          replies: (item.replies || []).map(function(rep) {
            return {
              content: rep ? rep.content : "",
              author: rep ? rep.author : ""
            };
          })
        });
      }

      if (isLite) {
        var liteOut = JSON.stringify({
          status: "success",
          format: "v2",
          lite: true,
          tabUsed: tabName,
          totalColumns: lastCol,
          rows: compactRows
        });
        if (liteOut.length < 95000) {
          try {
            CacheService.getScriptCache().put(liteCacheKey, liteOut, 300);
          } catch (putErr) {}
        }
        return ContentService
          .createTextOutput(liteOut)
          .setMimeType(ContentService.MimeType.JSON);
      }

      var corePayload = {
        tabUsed: tabName,
        totalColumns: lastCol,
        rows: compactRows,
        comments: compactComments,
        managerNotes: managerNotes
      };

      var payloadHash = computeMd5Hex(JSON.stringify(corePayload));
      if (clientHash && clientHash === payloadHash) {
        return ContentService
          .createTextOutput(JSON.stringify({
            status: "not_modified",
            hash: payloadHash
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      return ContentService
        .createTextOutput(JSON.stringify({
          status: "success",
          format: "v2",
          hash: payloadHash,
          tabUsed: tabName,
          totalColumns: lastCol,
          rows: compactRows,
          comments: compactComments,
          managerNotes: managerNotes
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Legacy v1 response for older app versions
    var foundNotes = [];
    for (var nr = 0; nr < notes.length; nr++) {
      for (var nc = 0; nc < notes[nr].length; nc++) {
        var noteText = (notes[nr][nc] || "").toString().trim();
        if (noteText.length > 0) {
          foundNotes.push({
            row: nr + 1,
            col: nc + 1,
            cellText: String(values[nr][nc] || ""),
            noteText: noteText
          });
        }
      }
    }

    var response = {
      status: "success",
      spreadsheet: ss.getName(),
      spreadsheetID: SPREADSHEET_ID,
      tabUsed: tabName,
      totalRows: lastRow,
      totalColumns: lastCol,
      totalNotesFound: foundNotes.length,
      totalComments: comments.length,
      foundNotesSummary: foundNotes,
      comments: comments,
      values: values,
      notes: notes,
      backgrounds: backgrounds,
      fontLines: fontLines,
      managerNotes: managerNotes
    };

    return ContentService
      .createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({
        status: "error",
        message: err.toString(),
        stack: err.stack || ""
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || "{}");

    if (body.action === "register_push") {
      return handleRegisterPush(body);
    }
    if (body.action === "unregister_push") {
      return handleUnregisterPush(body);
    }
    if (body.action === "register_web_push") {
      return handleRegisterWebPush(body);
    }
    if (body.action === "unregister_web_push") {
      return handleUnregisterWebPush(body);
    }

    var pairs = [
      "fvv=1",
      "pageHistory=0",
      "fbzx="
    ];

    if (body.dateIso) {
      var parts = String(body.dateIso).split("-");
      if (parts.length === 3) {
        pairs.push("entry.697979218=" + encodeURIComponent(body.dateIso));
        pairs.push("entry.697979218_year=" + encodeURIComponent(parts[0]));
        pairs.push("entry.697979218_month=" + encodeURIComponent(parts[1]));
        pairs.push("entry.697979218_day=" + encodeURIComponent(parts[2]));
      } else {
        pairs.push("entry.697979218=" + encodeURIComponent(body.dateIso));
      }
    }

    pairs.push("entry.1132009206=" + encodeURIComponent(body.guideName || ""));
    pairs.push("entry.807838289=" + encodeURIComponent(String(body.attendedPax || 0)));
    pairs.push("entry.2061766555=" + encodeURIComponent(body.notes || ""));

    if (body.tripOption === "Other") {
      pairs.push("entry.2012610289=__other_option__");
      pairs.push(
        "entry.2012610289.other_option_response=" +
          encodeURIComponent(body.otherTripText || "Other")
      );
    } else if (body.tripOption) {
      pairs.push("entry.2012610289=" + encodeURIComponent(body.tripOption));
    }

    if (body.hillHikeLocation && String(body.hillHikeLocation).trim().length > 0) {
      var loc = String(body.hillHikeLocation).trim();
      if (loc.toLowerCase().indexOf("tver") !== -1) {
        loc = "Tverfjellet";
      }
      pairs.push("entry.1039943902=" + encodeURIComponent(loc));
    }

    var res = UrlFetchApp.fetch(FORM_RESPONSE_URL, {
      method: "post",
      contentType: "application/x-www-form-urlencoded",
      payload: pairs.join("&"),
      followRedirects: false,
      muteHttpExceptions: true
    });

    var code = res.getResponseCode();
    if (code === 200 || code === 302) {
      try {
        recordSubmittedTripReport(body);
      } catch (recErr) {}
      return ContentService
        .createTextOutput(JSON.stringify({ status: "success", httpCode: code }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify({
        status: "error",
        httpCode: code,
        message: "Google Form rejected submission (HTTP " + code + ")"
      }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({
        status: "error",
        message: err.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================================
// SERVER-SIDE 18:30 PUSH NOTIFICATIONS (Expo Push API)
// ============================================================================

var EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
var PUSH_SUBSCRIBERS_PROP_KEY = "PUSH_SUBSCRIBERS_V1";
var PUSH_RENTAL_COL = 2;      // Column C
var PUSH_GUIDES_DUTY_COL = 41; // Column AP
var PUSH_SHIP_COL_BB = 53;    // Column BB
var PUSH_STAFF_START = 68;    // Column BQ
var PUSH_STAFF_END = 105;     // Column DB
var PUSH_MICHAL_COL = 95;

var PUSH_AMBIGUOUS_INITIALS = {
  to: 1, he: 1, "in": 1, no: 1, at: 1, on: 1, or: 1, as: 1, is: 1, by: 1,
  an: 1, am: 1, pm: 1, so: 1, "do": 1, go: 1, up: 1, my: 1, we: 1, me: 1,
  be: 1, "if": 1, of: 1, it: 1, us: 1, ok: 1
};

var PUSH_SHIP_KEYWORDS = [
  { name: "Havila Capella", keywords: ["capella"] },
  { name: "Havila Castor", keywords: ["castor"] },
  { name: "Havila Polaris", keywords: ["polaris"] },
  { name: "Havila Pollux", keywords: ["pollux"] },
  { name: "MS Kong Harald", keywords: ["kong harald"] },
  { name: "MS Nordkapp", keywords: ["nordkapp"] },
  { name: "MS Nordlys", keywords: ["nordlys"] },
  { name: "MS Nordnorge", keywords: ["nordnorge"] },
  { name: "MS Polarlys", keywords: ["polarlys"] },
  { name: "MS Richard With", keywords: ["richard with"] },
  { name: "MS Trollfjord", keywords: ["trollfjord"] },
  { name: "MS Finnmarken", keywords: ["finnmarken"] },
  { name: "MS Vesterålen", keywords: ["vesterålen", "vesteralen"] },
  { name: "MS Midnatsol", keywords: ["midnatsol", "midnattsol"] }
];

var PUSH_PARTNERS = [
  { pattern: /\bnext\s+travel\s+nordic\b/i, label: "Next Travel Nordic" },
  { pattern: /\bdelta\s+of\s+scandinavia\b/i, label: "Delta of Scandinavia" },
  { pattern: /\bbest\s+arctic\b/i, label: "Best Arctic" },
  { pattern: /\bnordic\s+tours\b/i, label: "Nordic Tours" },
  { pattern: /\bbaraka\b/i, label: "Baraka" },
  { pattern: /\bintrepid\b/i, label: "Intrepid" },
  { pattern: /\bs\.h\.tours\b/i, label: "S.H.Tours" },
  { pattern: /\btui\b/i, label: "TUI" },
  { pattern: /\becs\b/i, label: "ECS" }
];

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function loadPushSubscribers() {
  var raw = PropertiesService.getScriptProperties().getProperty(PUSH_SUBSCRIBERS_PROP_KEY);
  if (!raw) return {};
  try {
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

function savePushSubscribers(map) {
  PropertiesService.getScriptProperties().setProperty(
    PUSH_SUBSCRIBERS_PROP_KEY,
    JSON.stringify(map || {})
  );
}

function handleRegisterPush(body) {
  var token = String(body.token || "").trim();
  var initials = String(body.initials || "").trim();
  var fullName = String(body.fullName || "").trim();
  var contractType = String(body.contractType || "full-time").trim();

  var validToken =
    token.indexOf("ExponentPushToken[") === 0 ||
    token.indexOf("ExpoPushToken[") === 0;
  if (!validToken || !initials) {
    return jsonOut({ status: "error", message: "Missing valid Expo push token or initials." });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var subs = loadPushSubscribers();
    subs[token] = {
      token: token,
      initials: initials,
      fullName: fullName,
      contractType: contractType === "part-time" ? "part-time" : "full-time",
      updatedAt: new Date().toISOString()
    };
    savePushSubscribers(subs);
  } finally {
    lock.releaseLock();
  }

  return jsonOut({ status: "success", registered: true });
}

function handleUnregisterPush(body) {
  var token = String(body.token || "").trim();
  if (!token) return jsonOut({ status: "success", removed: false });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var subs = loadPushSubscribers();
    if (subs[token]) {
      delete subs[token];
      savePushSubscribers(subs);
    }
  } finally {
    lock.releaseLock();
  }
  return jsonOut({ status: "success", removed: true });
}

function pushNormalizeHeader(val) {
  return String(val || "").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
}

function pushParseIntOrZero(val) {
  var n = parseInt(String(val || "").trim(), 10);
  return isFinite(n) && n > 0 ? n : 0;
}

function pushCellContainsInitials(cellValue, guideInitials) {
  var targetClean = String(guideInitials || "").trim();
  if (!targetClean) return false;
  var targetLower = targetClean.toLowerCase();
  var raw = String(cellValue || "").trim();
  if (!raw) return false;

  var tokens = raw.split(/[^A-Za-z0-9ÆØÅæøå]+/).filter(function(t) { return t.length > 0; });
  if (tokens.length === 0) return false;

  var isAmbiguous = Boolean(PUSH_AMBIGUOUS_INITIALS[targetLower]);
  var allShort = tokens.every(function(t) { return t.length <= 3 && !/^\d+$/.test(t); });

  for (var i = 0; i < tokens.length; i++) {
    var tok = tokens[i];
    if (tok.toLowerCase() !== targetLower) continue;
    if (!isAmbiguous) return true;
    if (/[A-ZÆØÅ]/.test(tok) || allShort) return true;
  }
  return false;
}

function pushIsTourColumn(colIndex, headerText) {
  var clean = String(headerText || "").trim();
  if (!clean) return false;
  var lower = clean.toLowerCase();

  if (
    lower.indexOf("meeting") !== -1 ||
    lower.indexOf("on duty") !== -1 ||
    lower.indexOf("available guides") !== -1 ||
    lower.indexOf("needed guides") !== -1 ||
    lower.indexOf("workshop") !== -1 ||
    lower.indexOf("tasks") !== -1 ||
    lower.indexOf("deliver") !== -1 ||
    lower.indexOf("pick up") !== -1 ||
    lower.indexOf("extra opening") !== -1 ||
    lower === "t-ø" ||
    lower === "t-o" ||
    lower === "l-s" ||
    lower === "forecast" ||
    lower === "on board" ||
    lower === "shop" ||
    lower === "ship" ||
    lower === "pax" ||
    lower === "minibus" ||
    lower.indexOf("minibus driver") !== -1 ||
    lower.indexOf("caravelle") === 0
  ) {
    return false;
  }

  return (
    (colIndex >= 22 && colIndex <= 39) ||
    (colIndex >= 44 && colIndex <= 53) ||
    (colIndex >= 54 && colIndex <= 63)
  );
}

function pushFormatHHMM(minutes) {
  var h = Math.floor(minutes / 60) % 24;
  var m = minutes % 60;
  return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
}

function pushParseStartTime(text) {
  if (!text) return null;
  var rangeRegex = /\b(\d{1,2})([:.])\s*(\d{2})\s*[-–]\s*(\d{1,2})(?:([:.])\s*(\d{2}))?\b/g;
  var match;
  while ((match = rangeRegex.exec(text)) !== null) {
    var sh = parseInt(match[1], 10);
    var sSep = match[2];
    var sm = parseInt(match[3], 10);
    var eh = parseInt(match[4], 10);
    var eSep = match[5];
    var em = match[6] ? parseInt(match[6], 10) : 0;
    if (sh >= 7 && sh <= 23 && sm >= 0 && sm <= 59 && eh >= 7 && eh <= 23 && em >= 0 && em <= 59) {
      if (sSep === "." && match[6] && eSep === "." && (sm % 5 !== 0 || em % 5 !== 0)) continue;
      if (eh * 60 + em > sh * 60 + sm) {
        var startMin = sh * 60 + sm;
        var endMin = eh * 60 + em;
        return {
          startMinutes: startMin,
          endMinutes: endMin,
          startLabel: pushFormatHHMM(startMin),
          endLabel: pushFormatHHMM(endMin)
        };
      }
    }
  }

  var singleRegex = /(?:^|\s|at\s+)(\d{1,2})([:.])\s*(\d{2})(?!\.\d)\b/gi;
  var smatch;
  while ((smatch = singleRegex.exec(text)) !== null) {
    var h = parseInt(smatch[1], 10);
    var sep = smatch[2];
    var m = parseInt(smatch[3], 10);
    if (h >= 7 && h <= 23 && m >= 0 && m <= 59) {
      if (sep === "." && m % 5 !== 0) continue;
      var sMin = h * 60 + m;
      return {
        startMinutes: sMin,
        endMinutes: null,
        startLabel: pushFormatHHMM(sMin),
        endLabel: null
      };
    }
  }
  return null;
}

function pushDetectShip(text) {
  var lower = String(text || "").toLowerCase();
  for (var i = 0; i < PUSH_SHIP_KEYWORDS.length; i++) {
    var entry = PUSH_SHIP_KEYWORDS[i];
    for (var j = 0; j < entry.keywords.length; j++) {
      if (lower.indexOf(entry.keywords[j]) !== -1) return entry.name;
    }
  }
  var mein = /mein\s*schiff(?:\s*\d+)?/i.exec(text || "");
  if (mein) return mein[0].replace(/\s+/g, " ").trim();
  if (/fred\s*olsen/i.test(text || "")) return "Fred Olsen";
  if (/\b(?:ms\s*)?hamburg\b/i.test(text || "")) return "MS Hamburg";
  return null;
}

function pushInferCategory(headerTitle, cellText) {
  var combined = (headerTitle + " " + cellText).toLowerCase();
  if (
    combined.indexOf("coffe") !== -1 ||
    combined.indexOf("coffee") !== -1 ||
    combined.indexOf("cafe") !== -1 ||
    combined.indexOf("tove") !== -1 ||
    combined.indexOf("malangen") !== -1
  ) return "Coffee Trip";
  if (combined.indexOf("fatbik") !== -1 || combined.indexOf("bike") !== -1) return "Fatbike";
  if (
    combined.indexOf("hill hike") !== -1 ||
    combined.indexOf("brosmetind") !== -1 ||
    combined.indexOf("nattmål") !== -1 ||
    combined.indexOf("tverrfjell") !== -1 ||
    combined.indexOf("rundfjell") !== -1 ||
    combined.indexOf("sightseeing hike") !== -1 ||
    combined.indexOf("hike") !== -1
  ) return "Hill Hike";
  if (combined.indexOf("snowshoe") !== -1) return "Snowshoe Trip";
  if (combined.indexOf("ski") !== -1) return "Ski Trip";
  if (
    combined.indexOf("trollfjord") !== -1 ||
    combined.indexOf("finnmarken") !== -1 ||
    combined.indexOf("midnatsol") !== -1 ||
    combined.indexOf("midnattsol") !== -1
  ) return "Ski Trip";
  return "Snowshoe Trip";
}

function pushMatchRegularTitle(headerTitle) {
  var lower = String(headerTitle || "").toLowerCase();
  if (/\bm5\b/.test(lower) || (lower.indexOf("ski") !== -1 && /14[:.]15/.test(lower))) return "HG ski trip";
  if (/\bn5\b/.test(lower) || (lower.indexOf("snowshoe") !== -1 && /14[:.]15/.test(lower))) return "HG snowshoe trip";
  if (lower.indexOf("coffe") !== -1 || lower.indexOf("coffee") !== -1) return "Coffee trip";
  if (lower.indexOf("fatbik") !== -1) return "Fatbike trip";
  if (lower.indexOf("brosmetind") !== -1 || lower.indexOf("sightseeing hike") !== -1) return "Sightseeing hike";
  if (lower.indexOf("w 104") !== -1 || lower.indexOf("hill hike") !== -1) return "Hill hike";
  if (lower.indexOf("w 103") !== -1 || (lower.indexOf("snowshoe") !== -1 && /10[:.]00/.test(lower))) return "Easy snowshoe trip";
  if (lower.indexOf("w 101") !== -1 || lower.indexOf("ski trip") !== -1) {
    if (/13[:.]30|14[:.]00|afternoon/.test(lower)) return "Ski trip afternoon";
    return "Ski trip morning";
  }
  return null;
}

function pushBuildDisplayName(headerTitle, cellText, shipName) {
  var regular = pushMatchRegularTitle(headerTitle);
  if (regular) {
    if (shipName && regular.toLowerCase().indexOf(shipName.toLowerCase()) === -1) {
      return regular + " · " + shipName;
    }
    return regular;
  }

  var lowerHeader = String(headerTitle || "").toLowerCase();
  var actLabel = pushInferCategory(headerTitle, cellText);
  if (lowerHeader.indexOf("group booking") === 0 || lowerHeader.indexOf("multyday") === 0) {
    if (shipName) return shipName + " · " + actLabel;
    for (var i = 0; i < PUSH_PARTNERS.length; i++) {
      if (PUSH_PARTNERS[i].pattern.test(cellText)) {
        return PUSH_PARTNERS[i].label + " · " + actLabel;
      }
    }
    if (/\bprivate\b/i.test(cellText)) return "Private · " + actLabel;
    return actLabel + " (" + headerTitle + ")";
  }
  if (shipName && lowerHeader.indexOf(shipName.toLowerCase()) === -1) {
    return headerTitle + " · " + shipName;
  }
  return headerTitle || "Scheduled Tour";
}

function pushFindRowForOsloDate(values, monthName, dayNum) {
  var currentMonth = "";
  for (var r = 0; r < values.length; r++) {
    var row = values[r] || [];
    var col0 = String(row[0] || "").trim().toUpperCase();
    if (MONTH_NAMES.indexOf(col0) !== -1) {
      currentMonth = col0;
      continue;
    }
    var col1Day = parseInt(String(row[1] || "").trim(), 10);
    if (currentMonth === monthName && col1Day === dayNum) {
      return r;
    }
  }
  return -1;
}

function pushNormalizeName(raw) {
  var s = String(raw || "");
  if (typeof s.normalize === "function") {
    s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  return s
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function pushExtractHeaderPrimaryName(rawHeader) {
  var withoutParens = String(rawHeader || "").replace(/\([^)]*\)/g, " ");
  var beforePercent = withoutParens.split(/\d+\s*%/)[0] || withoutParens;
  return pushNormalizeName(beforePercent);
}

function pushExtractHeaderParenInitials(rawHeader) {
  var out = [];
  var re = /\(([^)]+)\)/g;
  var m;
  while ((m = re.exec(String(rawHeader || ""))) !== null) {
    var inside = String(m[1] || "").trim().toLowerCase();
    if (/^[a-zæøå]{2,3}$/.test(inside)) {
      out.push(inside);
    }
  }
  return out;
}

function pushStaffCellHasToken(rawCell, targetLower) {
  if (!targetLower) return false;
  var tokens = String(rawCell || "")
    .toLowerCase()
    .split(/[^a-z0-9æøå]+/);
  for (var i = 0; i < tokens.length; i++) {
    if (tokens[i] === targetLower) return true;
  }
  return false;
}

function pushIsOnDutyText(cellLower) {
  return (
    cellLower.indexOf("work") !== -1 ||
    cellLower.indexOf("rc") !== -1 ||
    cellLower.indexOf("sato") !== -1 ||
    cellLower.indexOf("first aid") !== -1 ||
    cellLower.indexOf("training") !== -1 ||
    cellLower.indexOf("inventory") !== -1 ||
    cellLower.indexOf("email") !== -1 ||
    cellLower.indexOf("guiding") !== -1 ||
    cellLower.indexOf("course") !== -1 ||
    cellLower.indexOf("military") !== -1
  );
}

function pushFindStaffCol(headerRow, subscriber, values) {
  var targetNorm = pushNormalizeName(subscriber.fullName || "");
  var targetFirst = targetNorm ? targetNorm.split(" ")[0] : "";
  var targetInit = String(subscriber.initials || "").trim().toLowerCase();
  var maxCol = Math.min(PUSH_STAFF_END, headerRow.length - 1);

  var cols = [];
  for (var c = PUSH_STAFF_START; c <= maxCol; c++) {
    var raw = pushNormalizeHeader(headerRow[c]);
    if (!raw) continue;
    cols.push({
      c: c,
      raw: raw,
      primary: pushExtractHeaderPrimaryName(raw),
      parenInits: pushExtractHeaderParenInitials(raw)
    });
  }

  if (targetNorm) {
    for (var i = 0; i < cols.length; i++) {
      var p = cols[i].primary;
      if (!p) continue;
      if (
        p === targetNorm ||
        targetNorm.indexOf(p + " ") === 0 ||
        (targetFirst.length >= 2 && p === targetFirst)
      ) {
        return cols[i].c;
      }
    }
  }

  if (targetInit) {
    for (var j = 0; j < cols.length; j++) {
      if (cols[j].parenInits.indexOf(targetInit) !== -1) {
        return cols[j].c;
      }
    }
  }

  if (targetFirst.length >= 2) {
    for (var k = 0; k < cols.length; k++) {
      var toks = cols[k].primary.split(" ");
      if (toks.indexOf(targetFirst) !== -1) {
        return cols[k].c;
      }
    }
  }

  if (targetInit && values && values.length > 2) {
    var bestCol = -1;
    var bestHits = 0;
    for (var m = 0; m < cols.length; m++) {
      var hits = 0;
      for (var r = 2; r < values.length; r++) {
        var cell = String((values[r] && values[r][cols[m].c]) || "").trim().toLowerCase();
        if (!cell) continue;
        if (cell === targetInit) {
          hits += 3;
        } else if (pushStaffCellHasToken(cell, targetInit) && !pushIsOnDutyText(cell)) {
          hits += 1;
        }
      }
      if (hits > bestHits) {
        bestHits = hits;
        bestCol = cols[m].c;
      }
    }
    if (bestCol !== -1) return bestCol;
  }

  if (
    (targetFirst === "michal" || targetInit === "mh") &&
    headerRow.length > PUSH_MICHAL_COL
  ) {
    return PUSH_MICHAL_COL;
  }
  return -1;
}

function pushSplitDriverClause(cellText) {
  var driverChunks = [];
  var nonDriverWords = {
    minibus: true, caravelle: true, carvelle: true, taxi: true, bus: true, van: true,
    no: true, a: true, the: true, our: true, extra: true, own: true, private: true
  };
  var guideText = String(cellText || "").replace(
    /([A-Za-zÆØÅæøå]{2,}(?:\s*(?:\/|\+|&)\s*[A-Za-zÆØÅæøå]{2,})*)\s+\b(?:drives?|driver|driving)\b/gi,
    function(fullMatch, groupRaw) {
      var parts = String(groupRaw || "").split(/[^A-Za-zÆØÅæøå]+/).filter(function(t) {
        return t.length >= 2 && !nonDriverWords[t.toLowerCase()];
      });
      if (parts.length === 0) return fullMatch;
      driverChunks.push(parts.join("/"));
      return " ";
    }
  );
  return {
    guideText: guideText,
    driverText: driverChunks.join(" ")
  };
}

function pushBuildNotificationForGuide(headerRow, row, fontLineRow, subscriber, dayLabel, syncedClock) {
  var initials = String(subscriber.initials || "").trim();
  var tours = [];

  for (var c = 22; c < Math.min(66, headerRow.length); c++) {
    var headerTitle = pushNormalizeHeader(headerRow[c]);
    if (!pushIsTourColumn(c, headerTitle)) continue;

    var cellText = String(row[c] || "").trim();
    if (!cellText) continue;

    var lowerCell = cellText.toLowerCase();
    if (
      lowerCell.indexOf("closed") !== -1 ||
      lowerCell.indexOf("canceled") !== -1 ||
      lowerCell.indexOf("cancelled") !== -1
    ) {
      continue;
    }

    var fl = String((fontLineRow && fontLineRow[c]) || "").toLowerCase();
    if (fl.indexOf("line-through") !== -1) continue;

    var split = pushSplitDriverClause(cellText);
    var isGuideMatch = pushCellContainsInitials(split.guideText, initials);
    var isDriverMatch =
      split.driverText.length > 0 && pushCellContainsInitials(split.driverText, initials);
    if (!isGuideMatch && !isDriverMatch) continue;
    var isDriverOnly = !isGuideMatch && isDriverMatch;

    var h1 = pushNormalizeHeader(headerRow[c + 1]).toLowerCase();
    var h2 = pushNormalizeHeader(headerRow[c + 2]).toLowerCase();
    var h3 = pushNormalizeHeader(headerRow[c + 3]).toLowerCase();
    var isShipBlock = h1 === "forecast" && h2 === "on board" && h3 === "shop";

    var guestCount = 0;
    var shipName = null;
    if (isShipBlock) {
      guestCount = pushParseIntOrZero(row[c + 2]) + pushParseIntOrZero(row[c + 3]);
      var maxShipCol = Math.max(c + 8, PUSH_SHIP_COL_BB);
      for (var s = c + 4; s <= Math.min(maxShipCol, headerRow.length - 1); s++) {
        if (pushNormalizeHeader(headerRow[s]).toLowerCase() === "ship" || s === PUSH_SHIP_COL_BB) {
          var rawShip = String(row[s] || "").trim();
          if (rawShip) {
            shipName = pushDetectShip(rawShip) || rawShip;
            break;
          }
        }
      }
    } else {
      guestCount = pushParseIntOrZero(row[c + 1]);
      if (guestCount === 0) {
        var inlinePax = /(\d+)\s*pax\b/i.exec(cellText);
        if (inlinePax && inlinePax[1]) guestCount = pushParseIntOrZero(inlinePax[1]);
      }
    }

    if (!shipName) {
      shipName = pushDetectShip(cellText);
    }

    var parsedTime = pushParseStartTime(cellText) || pushParseStartTime(headerTitle);
    var displayName = pushBuildDisplayName(headerTitle, cellText, shipName);

    tours.push({
      tourName: displayName,
      startMinutes: parsedTime ? parsedTime.startMinutes : 9999,
      startLabel: parsedTime ? parsedTime.startLabel : "",
      guestCount: guestCount,
      isDriverOnly: isDriverOnly
    });
  }

  tours.sort(function(a, b) { return a.startMinutes - b.startMinutes; });

  // Check Rental Center (Col C) and Guides on Duty (Col AP)
  var rentalCol = PUSH_RENTAL_COL;
  for (var rc = 0; rc <= Math.min(10, headerRow.length - 1); rc++) {
    var rh = pushNormalizeHeader(headerRow[rc]).toLowerCase();
    if (rh.indexOf("rental center") !== -1 || rh.indexOf("rental centre") !== -1) {
      rentalCol = rc;
      break;
    }
  }
  var guidesCol = PUSH_GUIDES_DUTY_COL;
  for (var gc = 20; gc < Math.min(PUSH_STAFF_START, headerRow.length); gc++) {
    if (pushNormalizeHeader(headerRow[gc]).toLowerCase().indexOf("guides on duty") !== -1) {
      guidesCol = gc;
      break;
    }
  }

  var rawRental = String(row[rentalCol] || "").trim();
  var rawGuides = String(row[guidesCol] || "").trim();
  var inRental = pushCellContainsInitials(rawRental, initials);
  var inGuides = pushCellContainsInitials(rawGuides, initials);

  var title = "Tomorrow's Schedule (" + dayLabel + ")";
  var body = "";

  if (tours.length > 0) {
    var summaries = tours.map(function(t) {
      var timePrefix = t.startLabel ? t.startLabel + " " : "";
      var roleSuffix = t.isDriverOnly ? " [Driver]" : "";
      var paxSuffix = t.guestCount > 0 ? " (" + t.guestCount + " pax)" : "";
      return timePrefix + t.tourName + roleSuffix + paxSuffix;
    });
    if (inRental) summaries.push("Rental Center");
    body = summaries.join(" · ");
  } else if (inRental && inGuides) {
    title = "Tomorrow: Rental Center + Guiding (" + dayLabel + ")";
    body = 'Listed in Rental Center ("' + rawRental + '") and Guides on Duty.';
  } else if (inRental) {
    title = "Tomorrow: Rental Center (" + dayLabel + ")";
    body = 'Listed in Rental Center (Col C): "' + rawRental + '".';
  } else if (inGuides) {
    title = "Tomorrow: Guiding — No Tour Assigned (" + dayLabel + ")";
    body = "Listed in Guides on Duty (Col AP), with no tour assigned yet.";
  } else {
    var staffCol = pushFindStaffCol(headerRow, subscriber, values);
    var isPartTime = subscriber.contractType === "part-time";
    var staffCell = staffCol !== -1 ? String(row[staffCol] || "").trim() : "";
    var staffLower = staffCell.toLowerCase();
    var initLower = String(initials || "").trim().toLowerCase();
    var hasOwnInit = pushStaffCellHasToken(staffCell, initLower);
    var isAmbiguousInit = !!PUSH_AMBIGUOUS_INITIALS[initLower];

    var isOff = false;
    if (staffCol === -1) {
      isOff = isPartTime;
    } else if (!staffLower) {
      isOff = isPartTime;
    } else if (
      staffLower.indexOf("off") !== -1 ||
      staffLower.indexOf("holiday") !== -1 ||
      staffLower.indexOf("avspasering") !== -1 ||
      staffLower.indexOf("unpaid") !== -1 ||
      staffLower.indexOf("leave") !== -1 ||
      staffLower.indexOf("request") !== -1 ||
      staffLower.indexOf("permisjon") !== -1 ||
      staffLower.indexOf("not available") !== -1 ||
      staffLower.indexOf("unavailable") !== -1 ||
      (hasOwnInit && !isAmbiguousInit)
    ) {
      isOff = true;
    } else if (pushIsOnDutyText(staffLower)) {
      isOff = false;
    } else if (hasOwnInit) {
      isOff = true;
    } else {
      isOff = !isPartTime;
    }

    if (isOff) {
      title = "Tomorrow: Day Off (" + dayLabel + ")";
      body = "No tours or shift assigned tomorrow. Enjoy your day off!";
    } else {
      title = "Tomorrow: Base / Workshop Duty (" + dayLabel + ")";
      body = staffCell
        ? 'Schedule note: "' + staffCell + '".'
        : "On duty at Tromsø Outdoor tomorrow.";
    }
  }

  return {
    title: title,
    body: body + " · synced " + syncedClock
  };
}

/**
 * Daily 18:30 Europe/Oslo trigger target:
 * Reads the live 1.6 schedule sheet right now and pushes each registered guide's
 * tomorrow schedule directly via Expo Push API (bypasses Android Doze / Battery Saver).
 */
function sendDailyTomorrowNotifications() {
  var subs = loadPushSubscribers();
  var tokens = Object.keys(subs);
  var webSubsCheck = loadWebPushSubscribers();
  var webTokensCheck = Object.keys(webSubsCheck);
  if (tokens.length === 0 && webTokensCheck.length === 0) {
    Logger.log("No registered Android or Web push subscribers yet.");
    return;
  }

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheets()[0];
  if (!sheet) {
    Logger.log("Main schedule sheet not found.");
    return;
  }

  var lastRow = Math.min(sheet.getLastRow(), MAX_ROWS);
  var lastCol = Math.min(sheet.getLastColumn(), MAX_COLS);
  var range = sheet.getRange(1, 1, lastRow, lastCol);
  var values = range.getValues();
  var fontLines = range.getFontLines();
  var headerRow = values[1] || [];

  var now = new Date();
  var tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  var monthIdx = parseInt(Utilities.formatDate(tomorrow, "Europe/Oslo", "M"), 10) - 1;
  var dayNum = parseInt(Utilities.formatDate(tomorrow, "Europe/Oslo", "d"), 10);
  var monthName = MONTH_NAMES[monthIdx] || "";
  var tomorrowIso = Utilities.formatDate(tomorrow, "Europe/Oslo", "yyyy-MM-dd");
  var dayLabel = Utilities.formatDate(tomorrow, "Europe/Oslo", "EEE d MMM");
  var syncedClock = Utilities.formatDate(now, "Europe/Oslo", "HH:mm");

  var rowIdx = pushFindRowForOsloDate(values, monthName, dayNum);
  if (rowIdx === -1) {
    Logger.log("Could not find sheet row for tomorrow (" + monthName + " " + dayNum + ").");
    return;
  }

  var row = values[rowIdx] || [];
  var fontLineRow = fontLines[rowIdx] || [];
  var messages = [];

  for (var i = 0; i < tokens.length; i++) {
    var sub = subs[tokens[i]];
    if (!sub || !sub.token || !sub.initials) continue;
    var msg = pushBuildNotificationForGuide(headerRow, row, fontLineRow, sub, dayLabel, syncedClock);
    messages.push({
      to: sub.token,
      sound: "default",
      priority: "high",
      channelId: "default",
      title: msg.title,
      body: msg.body,
      data: {
        type: "tomorrow_dispatch",
        targetDateIso: tomorrowIso
      }
    });
  }

  var staleTokens = [];
  for (var b = 0; b < messages.length; b += 100) {
    var chunk = messages.slice(b, b + 100);
    var res = UrlFetchApp.fetch(EXPO_PUSH_URL, {
      method: "post",
      contentType: "application/json",
      headers: { Accept: "application/json" },
      payload: JSON.stringify(chunk),
      muteHttpExceptions: true
    });
    Logger.log("Expo Push HTTP " + res.getResponseCode() + ": " + res.getContentText());

    try {
      var parsed = JSON.parse(res.getContentText());
      var tickets = Array.isArray(parsed.data) ? parsed.data : [];
      for (var t = 0; t < tickets.length; t++) {
        var ticket = tickets[t];
        if (ticket && ticket.status === "error" && ticket.details && ticket.details.error === "DeviceNotRegistered") {
          staleTokens.push(chunk[t].to);
        }
      }
    } catch (parseErr) {}
  }

  if (staleTokens.length > 0) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var currentSubs = loadPushSubscribers();
      for (var s = 0; s < staleTokens.length; s++) {
        delete currentSubs[staleTokens[s]];
      }
      savePushSubscribers(currentSubs);
    } finally {
      lock.releaseLock();
    }
  }

  Logger.log("Sent " + messages.length + " Expo (Android) tomorrow notifications for " + tomorrowIso + ".");

  // Also send FCM HTTP v1 Web Push notifications for iPhone PWA / Web guides
  sendDailyWebPushNotifications(headerRow, row, fontLineRow, dayLabel, syncedClock, tomorrowIso);
}

// ============================================================================
// WEB / iPHONE PWA PUSH NOTIFICATIONS (Firebase Cloud Messaging HTTP v1)
// ============================================================================

var WEB_PUSH_SUBSCRIBERS_PROP_KEY = "WEB_PUSH_SUBSCRIBERS_V1";
var FCM_PROJECT_ID = "to-guides";
var FCM_SEND_URL = "https://fcm.googleapis.com/v1/projects/" + FCM_PROJECT_ID + "/messages:send";
var FCM_TOKEN_CACHE_KEY = "FCM_V1_ACCESS_TOKEN_CACHE";

function loadWebPushSubscribers() {
  var raw = PropertiesService.getScriptProperties().getProperty(WEB_PUSH_SUBSCRIBERS_PROP_KEY);
  if (!raw) return {};
  try {
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveWebPushSubscribers(map) {
  PropertiesService.getScriptProperties().setProperty(
    WEB_PUSH_SUBSCRIBERS_PROP_KEY,
    JSON.stringify(map || {})
  );
}

function handleRegisterWebPush(body) {
  var fcmToken = String(body.fcmToken || body.token || "").trim();
  var initials = String(body.initials || "").trim();
  var fullName = String(body.fullName || "").trim();
  var contractType = String(body.contractType || "full-time").trim();

  if (fcmToken.length < 30 || !initials) {
    return jsonOut({ status: "error", message: "Missing valid FCM web token or initials." });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var subs = loadWebPushSubscribers();
    subs[fcmToken] = {
      fcmToken: fcmToken,
      initials: initials,
      fullName: fullName,
      contractType: contractType === "part-time" ? "part-time" : "full-time",
      platform: "web",
      updatedAt: new Date().toISOString()
    };
    saveWebPushSubscribers(subs);
  } finally {
    lock.releaseLock();
  }

  return jsonOut({ status: "success", registered: true, platform: "web" });
}

function handleUnregisterWebPush(body) {
  var fcmToken = String(body.fcmToken || body.token || "").trim();
  if (!fcmToken) return jsonOut({ status: "success", removed: false });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var subs = loadWebPushSubscribers();
    if (subs[fcmToken]) {
      delete subs[fcmToken];
      saveWebPushSubscribers(subs);
    }
  } finally {
    lock.releaseLock();
  }
  return jsonOut({ status: "success", removed: true });
}

function base64UrlEncodeBytes(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, "");
}

function base64UrlEncodeJson(obj) {
  return base64UrlEncodeBytes(Utilities.newBlob(JSON.stringify(obj)).getBytes());
}

/**
 * Generates an OAuth2 access token for FCM HTTP v1 using Script Properties:
 *   FCM_CLIENT_EMAIL  (from Firebase Service Account JSON -> client_email)
 *   FCM_PRIVATE_KEY   (from Firebase Service Account JSON -> private_key)
 */
function getFcmV1AccessToken() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(FCM_TOKEN_CACHE_KEY);
  if (cached) return cached;

  var props = PropertiesService.getScriptProperties();
  var clientEmail = String(props.getProperty("FCM_CLIENT_EMAIL") || "")
    .trim()
    .replace(/^["']|["']$/g, "");
  var rawKey = String(props.getProperty("FCM_PRIVATE_KEY") || "")
    .trim()
    .replace(/^["']|["']$/g, "");

  if (!clientEmail || !rawKey) {
    Logger.log("FCM_CLIENT_EMAIL or FCM_PRIVATE_KEY Script Properties not configured; skipping Web Push.");
    return null;
  }

  // Handle literal "\n" sequences if pasted straight from the JSON file
  var privateKeyPem = rawKey.replace(/\\n/g, "\n");
  var nowSec = Math.floor(Date.now() / 1000);

  var header = { alg: "RS256", typ: "JWT" };
  var claimSet = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: nowSec,
    exp: nowSec + 3600
  };

  var signingInput = base64UrlEncodeJson(header) + "." + base64UrlEncodeJson(claimSet);
  var sigBytes = Utilities.computeRsaSha256Signature(signingInput, privateKeyPem);
  var jwt = signingInput + "." + base64UrlEncodeBytes(sigBytes);

  var tokenRes = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    payload:
      "grant_type=" +
      encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") +
      "&assertion=" +
      encodeURIComponent(jwt),
    muteHttpExceptions: true
  });

  if (tokenRes.getResponseCode() !== 200) {
    Logger.log("FCM OAuth2 token error HTTP " + tokenRes.getResponseCode() + ": " + tokenRes.getContentText());
    return null;
  }

  var tokenJson = JSON.parse(tokenRes.getContentText());
  if (!tokenJson.access_token) return null;

  // Cache for 50 minutes (tokens are valid for 60 minutes)
  cache.put(FCM_TOKEN_CACHE_KEY, tokenJson.access_token, 3000);
  return tokenJson.access_token;
}

function sendDailyWebPushNotifications(headerRow, row, fontLineRow, dayLabel, syncedClock, tomorrowIso) {
  var webSubs = loadWebPushSubscribers();
  var webTokens = Object.keys(webSubs);
  if (webTokens.length === 0) {
    Logger.log("No registered Web / iPhone PWA push subscribers yet.");
    return;
  }

  var accessToken = getFcmV1AccessToken();
  if (!accessToken) return;

  var staleWebTokens = [];
  var sentCount = 0;

  for (var i = 0; i < webTokens.length; i++) {
    var sub = webSubs[webTokens[i]];
    if (!sub || !sub.fcmToken || !sub.initials) continue;

    var msg = pushBuildNotificationForGuide(headerRow, row, fontLineRow, sub, dayLabel, syncedClock);
    var fcmPayload = {
      message: {
        token: sub.fcmToken,
        data: {
          title: msg.title,
          body: msg.body,
          type: "tomorrow_dispatch",
          targetDateIso: tomorrowIso
        },
        webpush: {
          headers: {
            Urgency: "high",
            TTL: "43200"
          }
        }
      }
    };

    var res = UrlFetchApp.fetch(FCM_SEND_URL, {
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization: "Bearer " + accessToken,
        Accept: "application/json"
      },
      payload: JSON.stringify(fcmPayload),
      muteHttpExceptions: true
    });

    var code = res.getResponseCode();
    var text = res.getContentText();
    if (code >= 200 && code < 300) {
      sentCount++;
    } else {
      Logger.log("FCM Web Push HTTP " + code + " for " + sub.initials + ": " + text);
      if (code === 404 || text.indexOf("UNREGISTERED") !== -1) {
        staleWebTokens.push(sub.fcmToken);
      }
    }
  }

  if (staleWebTokens.length > 0) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var currentWebSubs = loadWebPushSubscribers();
      for (var s = 0; s < staleWebTokens.length; s++) {
        delete currentWebSubs[staleWebTokens[s]];
      }
      saveWebPushSubscribers(currentWebSubs);
    } finally {
      lock.releaseLock();
    }
  }

  Logger.log("Sent " + sentCount + "/" + webTokens.length + " Web / iPhone PWA notifications for " + tomorrowIso + ".");
}

/**
 * Run ONCE in Apps Script Editor to schedule the daily 18:30 Europe/Oslo trigger.
 */
function setupDaily1830Trigger() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === "sendDailyTomorrowNotifications") {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }
  ScriptApp.newTrigger("sendDailyTomorrowNotifications")
    .timeBased()
    .inTimezone("Europe/Oslo")
    .everyDays(1)
    .atHour(18)
    .nearMinute(30)
    .create();
  Logger.log("Daily ~18:30 Europe/Oslo trigger created for sendDailyTomorrowNotifications.");
}

/**
 * Helper: run in Apps Script Editor to inspect registered Android & iPhone/Web devices.
 */
function listPushSubscribers() {
  Logger.log("=== Android (Expo Push) ===\n" + JSON.stringify(loadPushSubscribers(), null, 2));
  Logger.log("=== iPhone / Web (FCM v1) ===\n" + JSON.stringify(loadWebPushSubscribers(), null, 2));
}

/**
 * Helper: run in Apps Script Editor to verify FCM_CLIENT_EMAIL & FCM_PRIVATE_KEY Script Properties.
 */
function testFcmAuth() {
  var tok = getFcmV1AccessToken();
  Logger.log(tok ? "FCM v1 OAuth2 OK! Token prefix: " + tok.slice(0, 20) + "..." : "FCM v1 auth failed — check Script Properties.");
}

/**
 * Helper: run in Apps Script Editor to immediately test sending tomorrow's push to all devices.
 */
function testSendNotificationsNow() {
  sendDailyTomorrowNotifications();
}

function testAuth() {
  UrlFetchApp.fetch("https://google.com");
}

// ============================================================================
// POST-TRIP REPORT REMINDERS FOR WEB / iPHONE PWA (FCM HTTP v1)
// ============================================================================

var SUBMITTED_REPORTS_PROP_KEY = "SUBMITTED_TRIP_REPORTS_V1";
var POST_TRIP_SENT_PROP_KEY = "POST_TRIP_WEB_SENT_V1";

function loadJsonPropObject(key) {
  var raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) return {};
  try {
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveJsonPropObject(key, obj) {
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(obj || {}));
}

function getRecentOsloDateSet(daysBack) {
  var allowed = {};
  var now = new Date();
  for (var d = 0; d <= daysBack; d++) {
    var dt = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
    allowed[Utilities.formatDate(dt, "Europe/Oslo", "yyyy-MM-dd")] = true;
  }
  return allowed;
}

/**
 * Called from doPost() whenever a guide submits a post-trip report via the app.
 * Stores a compact 3-day record so Web Push reminders are skipped for already-submitted trips.
 */
function recordSubmittedTripReport(body) {
  var dateIso = String((body && body.dateIso) || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    dateIso = Utilities.formatDate(new Date(), "Europe/Oslo", "yyyy-MM-dd");
  }
  var guideNorm = pushNormalizeName((body && body.guideName) || "");
  var tourKey = String((body && body.tourKey) || "").trim();
  var tripOpt = String((body && body.tripOption) || "").trim().toLowerCase();
  if (!guideNorm && !tourKey) return;

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var map = loadJsonPropObject(SUBMITTED_REPORTS_PROP_KEY);
    var keepDates = getRecentOsloDateSet(3);
    keepDates[dateIso] = true;

    var cleaned = {};
    var existingDates = Object.keys(map);
    for (var i = 0; i < existingDates.length; i++) {
      var dk = existingDates[i];
      if (keepDates[dk] && Array.isArray(map[dk])) {
        cleaned[dk] = map[dk];
      }
    }

    if (!Array.isArray(cleaned[dateIso])) {
      cleaned[dateIso] = [];
    }
    cleaned[dateIso].push({
      g: guideNorm,
      k: tourKey,
      o: tripOpt
    });

    // Keep list bounded
    if (cleaned[dateIso].length > 100) {
      cleaned[dateIso] = cleaned[dateIso].slice(-100);
    }
    saveJsonPropObject(SUBMITTED_REPORTS_PROP_KEY, cleaned);
  } finally {
    lock.releaseLock();
  }
}

function pushDefaultDurationMinutes(headerTitle, cellText) {
  var combined = (String(headerTitle || "") + " " + String(cellText || "")).toLowerCase();
  if (
    combined.indexOf("hill hike") !== -1 ||
    combined.indexOf("w 104") !== -1 ||
    combined.indexOf("brosmetind") !== -1 ||
    combined.indexOf("nattmål") !== -1 ||
    combined.indexOf("tverrfjell") !== -1 ||
    combined.indexOf("rundfjell") !== -1 ||
    combined.indexOf("sightseeing hike") !== -1 ||
    combined.indexOf("hike") !== -1
  ) {
    return 300;
  }
  if (
    combined.indexOf("coffe") !== -1 ||
    combined.indexOf("coffee") !== -1 ||
    combined.indexOf("cafe") !== -1 ||
    combined.indexOf("tove") !== -1 ||
    combined.indexOf("malangen") !== -1
  ) {
    return 270;
  }
  var isShip =
    combined.indexOf("14:15") !== -1 ||
    combined.indexOf("14.15") !== -1 ||
    /\bhg\b/.test(combined) ||
    /\bm5\b/.test(combined) ||
    /\bn5\b/.test(combined);
  if (
    !isShip &&
    (combined.indexOf("w 103") !== -1 ||
      (combined.indexOf("snowshoe") !== -1 && combined.indexOf("10:00") !== -1) ||
      (combined.indexOf("snowshoe") !== -1 && combined.indexOf("10.00") !== -1))
  ) {
    return 150;
  }
  return 180;
}

function pushExtractGuideToursForRow(headerRow, row, fontLineRow, noteRow, initials) {
  var tours = [];

  for (var c = 22; c < Math.min(66, headerRow.length); c++) {
    var headerTitle = pushNormalizeHeader(headerRow[c]);
    if (!pushIsTourColumn(c, headerTitle)) continue;

    var cellText = String(row[c] || "").trim();
    if (!cellText) continue;

    var lowerCell = cellText.toLowerCase();
    if (
      lowerCell.indexOf("closed") !== -1 ||
      lowerCell.indexOf("canceled") !== -1 ||
      lowerCell.indexOf("cancelled") !== -1
    ) {
      continue;
    }

    var fl = String((fontLineRow && fontLineRow[c]) || "").toLowerCase();
    if (fl.indexOf("line-through") !== -1) continue;

    var split = pushSplitDriverClause(cellText);
    var isGuideMatch = pushCellContainsInitials(split.guideText, initials);
    var isDriverMatch =
      split.driverText.length > 0 && pushCellContainsInitials(split.driverText, initials);
    if (!isGuideMatch && !isDriverMatch) continue;
    var isDriverOnly = !isGuideMatch && isDriverMatch;

    var h1 = pushNormalizeHeader(headerRow[c + 1]).toLowerCase();
    var h2 = pushNormalizeHeader(headerRow[c + 2]).toLowerCase();
    var h3 = pushNormalizeHeader(headerRow[c + 3]).toLowerCase();
    var isShipBlock = h1 === "forecast" && h2 === "on board" && h3 === "shop";

    var shipName = null;
    if (isShipBlock) {
      var maxShipCol = Math.max(c + 8, PUSH_SHIP_COL_BB);
      for (var s = c + 4; s <= Math.min(maxShipCol, headerRow.length - 1); s++) {
        if (pushNormalizeHeader(headerRow[s]).toLowerCase() === "ship" || s === PUSH_SHIP_COL_BB) {
          var rawShip = String(row[s] || "").trim();
          if (rawShip) {
            shipName = pushDetectShip(rawShip) || rawShip;
            break;
          }
        }
      }
    }

    var noteText = String((noteRow && noteRow[c]) || "").trim();
    var combinedText = noteText ? cellText + "\n" + noteText : cellText;
    if (!shipName) {
      shipName = pushDetectShip(combinedText);
    }

    var parsedTime =
      pushParseStartTime(cellText) ||
      (noteText ? pushParseStartTime(noteText) : null) ||
      pushParseStartTime(headerTitle);

    var startMinutes = parsedTime ? parsedTime.startMinutes : null;
    var defaultDur = pushDefaultDurationMinutes(headerTitle, combinedText);
    var endMinutes =
      parsedTime && parsedTime.endMinutes !== null
        ? parsedTime.endMinutes
        : startMinutes !== null
          ? startMinutes + defaultDur
          : null;

    var displayName = pushBuildDisplayName(headerTitle, combinedText, shipName);
    var category = pushInferCategory(headerTitle, combinedText);

    tours.push({
      colIndex: c,
      headerTitle: headerTitle,
      tourName: displayName,
      category: category,
      startMinutes: startMinutes !== null ? startMinutes : 9999,
      endMinutes: endMinutes,
      startLabel: parsedTime ? parsedTime.startLabel : "",
      endLabel:
        parsedTime && parsedTime.endLabel
          ? parsedTime.endLabel
          : endMinutes !== null
            ? pushFormatHHMM(endMinutes)
            : "",
      isDriverOnly: isDriverOnly
    });
  }

  tours.sort(function(a, b) { return a.startMinutes - b.startMinutes; });
  return tours;
}

function guideNameMatchesSubscriber(submittedGuideNorm, subscriber) {
  if (!submittedGuideNorm) return false;
  var subNorm = pushNormalizeName((subscriber && subscriber.fullName) || "");
  var subInit = String((subscriber && subscriber.initials) || "").trim().toLowerCase();
  if (subNorm) {
    if (submittedGuideNorm === subNorm) return true;
    var subFirst = subNorm.split(" ")[0] || "";
    var repFirst = submittedGuideNorm.split(" ")[0] || "";
    if (subFirst.length >= 2 && subFirst === repFirst) return true;
  }
  if (subInit && submittedGuideNorm === subInit) return true;
  return false;
}

function isTourReportSubmittedOnServer(submittedList, todayIso, subscriber, tour, tourIdx, guidedTourCount) {
  if (!Array.isArray(submittedList) || submittedList.length === 0) return false;
  var expectedKey = todayIso + "_" + tour.tourName.replace(/\s+/g, "_") + "_" + tourIdx;
  var tourLower = (tour.tourName + " " + tour.category + " " + tour.headerTitle).toLowerCase();

  for (var i = 0; i < submittedList.length; i++) {
    var rec = submittedList[i];
    if (!rec) continue;
    if (rec.k && rec.k === expectedKey) return true;
    if (!guideNameMatchesSubscriber(rec.g, subscriber)) continue;

    // If the guide only has 1 guided tour today, any report submitted by them today covers it
    if (guidedTourCount <= 1) return true;

    // On multi-tour days, match by tour kind/keyword
    var opt = String(rec.o || "").toLowerCase();
    if (!opt) continue;
    if (opt.indexOf("hill") !== -1 && tourLower.indexOf("hill") !== -1) return true;
    if (opt.indexOf("coffee") !== -1 && tourLower.indexOf("coffee") !== -1) return true;
    if (opt.indexOf("14:15") !== -1 && tourLower.indexOf("hg") !== -1) return true;
    if (opt.indexOf("bike") !== -1 && (tourLower.indexOf("bike") !== -1 || tourLower.indexOf("fatbik") !== -1)) return true;
    if (opt.indexOf("ski") !== -1 && tourLower.indexOf("ski") !== -1) return true;
    if (opt.indexOf("snowshoe") !== -1 && tourLower.indexOf("snowshoe") !== -1) return true;
  }
  return false;
}

/**
 * Runs every 15 minutes via Apps Script trigger.
 * Sends FCM HTTP v1 Web Push post-trip report reminders (~15-30 min after a guided tour ends)
 * to registered Web / iPhone PWA guides who haven't submitted their report yet.
 */
function checkAndSendPostTripWebNotifications() {
  var now = new Date();
  var osloHour = parseInt(Utilities.formatDate(now, "Europe/Oslo", "H"), 10);
  var osloMinute = parseInt(Utilities.formatDate(now, "Europe/Oslo", "m"), 10);
  var nowMinutes = osloHour * 60 + osloMinute;

  // Only active during tour finish hours (10:30 - 21:30 Europe/Oslo)
  if (nowMinutes < 630 || nowMinutes > 1290) {
    return;
  }

  var webSubs = loadWebPushSubscribers();
  var webTokens = Object.keys(webSubs);
  if (webTokens.length === 0) {
    return;
  }

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheets()[0];
  if (!sheet) return;

  var lastRow = Math.min(sheet.getLastRow(), MAX_ROWS);
  var lastCol = Math.min(sheet.getLastColumn(), MAX_COLS);
  if (lastRow < 3 || lastCol < 25) return;

  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headerRow = values[1] || [];

  var monthIdx = parseInt(Utilities.formatDate(now, "Europe/Oslo", "M"), 10) - 1;
  var dayNum = parseInt(Utilities.formatDate(now, "Europe/Oslo", "d"), 10);
  var monthName = MONTH_NAMES[monthIdx] || "";
  var todayIso = Utilities.formatDate(now, "Europe/Oslo", "yyyy-MM-dd");

  var rowIdx = pushFindRowForOsloDate(values, monthName, dayNum);
  if (rowIdx === -1) return;

  var row = values[rowIdx] || [];
  var todayRange = sheet.getRange(rowIdx + 1, 1, 1, lastCol);
  var fontLineRow = todayRange.getFontLines()[0] || [];
  var noteRow = todayRange.getNotes()[0] || [];

  var submittedMap = loadJsonPropObject(SUBMITTED_REPORTS_PROP_KEY);
  var todaySubmitted = Array.isArray(submittedMap[todayIso]) ? submittedMap[todayIso] : [];
  var sentMap = loadJsonPropObject(POST_TRIP_SENT_PROP_KEY);

  var accessToken = null;
  var staleWebTokens = [];
  var newlySentKeys = [];
  var sentCount = 0;

  for (var i = 0; i < webTokens.length; i++) {
    var sub = webSubs[webTokens[i]];
    if (!sub || !sub.fcmToken || !sub.initials) continue;

    var tours = pushExtractGuideToursForRow(headerRow, row, fontLineRow, noteRow, sub.initials);
    if (tours.length === 0) continue;

    var guidedTourCount = 0;
    for (var g = 0; g < tours.length; g++) {
      if (!tours[g].isDriverOnly) guidedTourCount++;
    }

    for (var t = 0; t < tours.length; t++) {
      var tour = tours[t];
      if (tour.isDriverOnly) continue;
      if (tour.endMinutes === null) continue;

      var remindAt = tour.endMinutes + 15;
      if (nowMinutes < remindAt || nowMinutes > tour.endMinutes + 180) continue;

      var sentKey = todayIso + "|" + sub.fcmToken.slice(0, 32) + "|c" + tour.colIndex;
      if (sentMap[sentKey]) continue;

      if (isTourReportSubmittedOnServer(todaySubmitted, todayIso, sub, tour, t, guidedTourCount)) {
        continue;
      }

      if (!accessToken) {
        accessToken = getFcmV1AccessToken();
        if (!accessToken) return;
      }

      var tourKey = todayIso + "_" + tour.tourName.replace(/\s+/g, "_") + "_" + t;
      var title = "Post-Trip Report Reminder";
      var body = tour.endLabel
        ? tour.tourName + " ended at " + tour.endLabel + ". Tap to submit your post-trip report."
        : "Don't forget to submit your post-trip report for " + tour.tourName + ".";

      var fcmPayload = {
        message: {
          token: sub.fcmToken,
          data: {
            title: title,
            body: body,
            type: "trip_report",
            dateIso: todayIso,
            targetDateIso: todayIso,
            tourIdx: String(t),
            tourKey: tourKey,
            openReport: "1"
          },
          webpush: {
            headers: {
              Urgency: "high",
              TTL: "10800"
            }
          }
        }
      };

      var res = UrlFetchApp.fetch(FCM_SEND_URL, {
        method: "post",
        contentType: "application/json",
        headers: {
          Authorization: "Bearer " + accessToken,
          Accept: "application/json"
        },
        payload: JSON.stringify(fcmPayload),
        muteHttpExceptions: true
      });

      var code = res.getResponseCode();
      var text = res.getContentText();
      if (code >= 200 && code < 300) {
        sentCount++;
        newlySentKeys.push(sentKey);
        sentMap[sentKey] = true;
      } else {
        Logger.log("Post-trip Web Push HTTP " + code + " for " + sub.initials + ": " + text);
        if (code === 404 || text.indexOf("UNREGISTERED") !== -1) {
          staleWebTokens.push(sub.fcmToken);
          break;
        }
      }
    }
  }

  if (newlySentKeys.length > 0) {
    var keepDates = getRecentOsloDateSet(1);
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var latestSent = loadJsonPropObject(POST_TRIP_SENT_PROP_KEY);
      var prunedSent = {};
      var oldKeys = Object.keys(latestSent);
      for (var k = 0; k < oldKeys.length; k++) {
        var prefixDate = oldKeys[k].slice(0, 10);
        if (keepDates[prefixDate]) {
          prunedSent[oldKeys[k]] = true;
        }
      }
      for (var n = 0; n < newlySentKeys.length; n++) {
        prunedSent[newlySentKeys[n]] = true;
      }
      saveJsonPropObject(POST_TRIP_SENT_PROP_KEY, prunedSent);
    } finally {
      lock.releaseLock();
    }
  }

  if (staleWebTokens.length > 0) {
    var tokenLock = LockService.getScriptLock();
    tokenLock.waitLock(10000);
    try {
      var currentWebSubs = loadWebPushSubscribers();
      for (var st = 0; st < staleWebTokens.length; st++) {
        delete currentWebSubs[staleWebTokens[st]];
      }
      saveWebPushSubscribers(currentWebSubs);
    } finally {
      tokenLock.releaseLock();
    }
  }

  if (sentCount > 0) {
    Logger.log("Sent " + sentCount + " post-trip report Web Push reminder(s) for " + todayIso + ".");
  }
}

/**
 * Run ONCE in Apps Script Editor to enable 15-minute post-trip report Web Push checks
 * for iPhone PWA and desktop web guides.
 */
function setupPostTripReportTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === "checkAndSendPostTripWebNotifications") {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }
  ScriptApp.newTrigger("checkAndSendPostTripWebNotifications")
    .timeBased()
    .everyMinutes(15)
    .create();
  Logger.log("15-minute trigger created for checkAndSendPostTripWebNotifications.");
}

