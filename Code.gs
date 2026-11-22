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
    var daysAhead = parseInt(params.days || "40", 10);
    if (!isFinite(daysAhead) || daysAhead < 7) daysAhead = 40;
    if (daysAhead > 90) daysAhead = 90;
    var clientHash = String(params.hash || "").trim();

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
      notes = range.getNotes();
      backgrounds = range.getBackgrounds();
      fontLines = range.getFontLines();
    }

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

    var comments = [];
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

    var managerNotes = [];
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
    var body = JSON.parse(e.postData.contents || "{}");
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

function testAuth() {
  UrlFetchApp.fetch("https://google.com");
}
