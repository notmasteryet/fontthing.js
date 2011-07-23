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

  function parseOpenTypeHhea(data, funit) {
    var hhea = {};
    hhea.ascent = getInt16(data, 4);
    hhea.descent = getInt16(data, 6);
    hhea.lineGap = getInt16(data, 8);
    hhea.advanceWidthMax = getUint16(data, 10);
    hhea.minLeftSideBearing = getInt16(data, 12);
    hhea.minRightSideBearing = getInt16(data, 14);
    hhea.xMaxExtent = getUint16(data, 16);
    return hhea;
  }

  function OTF(data) {
    var length = data.length;
    var bin = new Uint8Array(length);
    for (var i = 0; i < length; ++i) {
      bin[i] = data.charCodeAt(i) & 0xFF;
    }
    this.binaryData = bin;
    
    var sfnt = parseSfnt(bin);
    var head = parseOpenTypeHead(sfnt.findTable('head').data);
    var hhea = parseOpenTypeHhea(sfnt.findTable('hhea').data);
    
    this.metrics = {
      unitsPerEm: head.unitsPerEm,
      glyphBounds: [head.xMin, head.yMin, head.xMax, head.yMax],
      ascent: hhea.ascent,
      descent: hhea.descent,
      lineGap: hhea.lineGap
    };
  }
  
  window.OTF = OTF;
})();