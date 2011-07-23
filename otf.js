(function() {
  function getUint16(data, offset) {
    return (data[offset] << 8) | data[offset + 1];
  }

  function getInt16(data, offset) {
    var num = (data[offset] << 8) | data[offset + 1];
    return (num & 0x8000) === 0 ? num : (num - 0x10000);
  }

  function getUint32(data, offset) {
    return (data[offset] << 24) | (data[offset + 1] << 16) |
      (data[offset + 2] << 8) | data[offset + 3];
  }

  function parseSfnt(data) {
    var sfnt = {};
    sfnt.tag = String.fromCharCode(data[0], data[1], data[2], data[3]);
    var numTables = getUint16(data, 4);
    sfnt.numTables = numTables;
    sfnt.tables = [];
    var offset = 12, i;
    for (i = 0; i < numTables; ++i) {
      var table = {};
      table.tag = String.fromCharCode(data[offset],
        data[offset + 1], data[offset + 2], data[offset + 3]);
      table.checksum = getUint32(data, offset + 4);
      var dataOffset = getUint32(data, offset + 8);
      var dataLength = getUint32(data, offset + 12);
      table.data = data.subarray(dataOffset, dataOffset + dataLength);
      offset += 16;
      sfnt.tables.push(table);
    }
    sfnt.findTable = function(tag) {
      for (var i = 0; i < this.tables.length; ++i) {
        if (this.tables[i].tag == tag)
          return this.tables[i];
      }
      throw 'table \"' + tag + '\" was not found';
    }
    return sfnt;
  }

  function parseOpenTypeHead(data) {
    var head = {};
    head.unitsPerEm = getUint16(data, 18);
    head.xMin = getInt16(data, 36);
    head.yMin = getInt16(data, 38);
    head.xMax = getInt16(data, 40);
    head.yMax = getInt16(data, 42);
    head.lowestRecPPEM = getUint16(data, 46);
    return head;
  }

  function parseOpenTypeHhea(data) {
    var hhea = {};
    hhea.ascent = getInt16(data, 4);
    hhea.descent = getInt16(data, 6);
    hhea.lineGap = getInt16(data, 8);
    hhea.advanceWidthMax = getUint16(data, 10);
    hhea.minLeftSideBearing = getInt16(data, 12);
    hhea.minRightSideBearing = getInt16(data, 14);
    hhea.xMaxExtent = getUint16(data, 16);
    hhea.numberOfHMetrics = getUint16(data, 34);
    return hhea;
  }

  function parseOpenTypeMaxp(data) {
    var maxp = {};
    maxp.numGlyphs = getUint16(data, 4);
    return maxp;
  }

  function parseOpenTypeCmap(data) {
    var cmap = [];
    var numTables = getUint16(data, 2);
    var i, offset = 4;
    var encodingTableOffset;
    for (i = 0; i < numTables; ++i) {
      var platformId = getUint16(data, offset);
      var encodingId = getUint16(data, offset + 2);
      var subtableOffset = getUint32(data, offset + 4);
      offset += 8;
      if (platformId == 3 || encodingId == 1) {
        // looking for Unicode BMP encoding ?
        encodingTableOffset = subtableOffset;
        break;
      }
    }
    if (!encodingTableOffset)
      throw 'Unicode BMP encoding not found';
    offset = encodingTableOffset;
    var format = getUint16(data, offset);
    var length = getUint16(data, offset + 2);
    if (format != 4)
      throw 'format 4 is expected';
    var segCount = getUint16(data, offset + 6) >> 1;
    offset += 14; // endCount
    var segments = [];
    for (i = 0; i < segCount; ++i, offset += 2) {
      var endCountItem = getUint16(data, offset);
      segments.push({end: endCountItem});
    }
    offset += 2; // startCount
    for (i = 0; i < segCount; ++i, offset += 2) {
      var startCountItem = getUint16(data, offset);
      segments[i].start = startCountItem;
    }
    for (i = 0; i < segCount; ++i, offset += 2) {
      var idDeltaItem = getInt16(data, offset);
      segments[i].idDelta = idDeltaItem;
    }
    for (i = 0; i < segCount; ++i, offset += 2) {
      var idRangeOffsetItem = getUint16(data, offset);
      if (idRangeOffsetItem == 0)
        continue; // calculated based on idDelta
      var glyphIdOffset = offset + idRangeOffsetItem;
      var glyphIds = [];
      var j, n = segments[i].end - segments[i].start + 1;
      for (j = 0; j < n; ++j, glyphIdOffset += 2)
        glyphIds.push(getUint16(data, glyphIdOffset));
      segments[i].glyphIds = glyphIds;
    }
    cmap.segments = segments;
    cmap.getGlyphIdByUnicode = function(code) {
      // TODO binary search
      var i, n = this.segments.length;
      for (i = 0; i < n; ++i) {
        var segment = this.segments[i];
        if (code > segment.end)
          break;
        if (code < segment.start)
          continue;
        // segment found
        if (segment.glyphIds)
          return segment.glyphIds[code - segment.start];
        return code + segment.idDelta;
      }
      return 0;
    };
    return cmap;
  }

  function parseOpenTypeHmtx(data, numGlyphs, numberOfHMetrics) {
    var hmtx = [];
    var offset = 0;
    var i, advanceWidth, lsb;
    for (i = 0; i < numberOfHMetrics; ++i) {
      advanceWidth = getUint16(data, offset);
      lsb = getInt16(data, offset + 2);
      offset += 4;
      hmtx.push({ advanceWidth: advanceWidth, lsb: lsb });
    }
    for (; i < numGlyphs; ++i) {
      lsb = getInt16(data, offset);
      offset += 2;
      hmtx.push({ advanceWidth: advanceWidth, lsb: lsb });
    }
    return hmtx;
  }

  function OTF(data) {
    var length = data.length;
    var bin = new Uint8Array(length);
    for (var i = 0; i < length; ++i) {
      bin[i] = data.charCodeAt(i) & 0xFF;
    }
    
    var sfnt = parseSfnt(bin);
    var head = parseOpenTypeHead(sfnt.findTable('head').data);
    var hhea = parseOpenTypeHhea(sfnt.findTable('hhea').data);
    var maxp = parseOpenTypeMaxp(sfnt.findTable('maxp').data);
    var hmtx = parseOpenTypeHmtx(sfnt.findTable('hmtx').data,
      maxp.numGlyphs, hhea.numberOfHMetrics);
    var cmap = parseOpenTypeCmap(sfnt.findTable('cmap').data);

    this.sfnt = sfnt;
    this.metrics = {
      unitsPerEm: head.unitsPerEm,
      maxBounds: [head.xMin, head.yMin, head.xMax, head.yMax],
      ascent: hhea.ascent,
      descent: hhea.descent,
      lineGap: hhea.lineGap
    };
    this.glyphsHorizontalMetrics = hmtx;
    this.getGlyphIds = function(s) {
      var ids = [];
      for (var i = 0, n = s.length; i < n; ++i)
        ids.push(cmap.getGlyphIdByUnicode(s.charCodeAt(i)));
      return ids;
    };
  }

  window.OTF = OTF;
})();