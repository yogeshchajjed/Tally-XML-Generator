import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { TallyData, Ledger, Voucher, StockItem, InventoryEntry } from '../types';
import { GST_STATE_CODES } from '../constants/gst';

export async function parseTallyXML(xmlContent: string): Promise<TallyData> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    parseTagValue: false,
    trimValues: true,
    processEntities: true
  });
  
  const voucherTypes: string[] = [];
  const ledgers: Ledger[] = [];
  const stockItems: StockItem[] = [];
  const transactions: Voucher[] = [];

  const extractName = (item: any): string => {
    if (!item) return '';
    if (typeof item === 'string') return item;
    if (Array.isArray(item)) return extractName(item[0]);
    
    // Check attribute first
    if (item["@_NAME"]) return String(item["@_NAME"]);
    
    // Check NAME property (can be string, array, or object with #text or CDATA)
    if (item.NAME) {
      if (typeof item.NAME === 'string') return item.NAME;
      if (Array.isArray(item.NAME)) return extractName(item.NAME[0]);
      if (typeof item.NAME === 'object') {
        const val = item.NAME['#text'] || item.NAME['#cdata'] || item.NAME.NAME || Object.values(item.NAME)[0];
        if (typeof val === 'string') return val;
        if (typeof val === 'object') return extractName(val);
      }
    }
    
    // Check NAME.LIST
    if (item["NAME.LIST"]) {
      const list = item["NAME.LIST"];
      if (list.NAME) {
        const names = Array.isArray(list.NAME) ? list.NAME : [list.NAME];
        return extractName(names[0]);
      }
    }

    // Check LANGUAGENAME.LIST
    if (item["LANGUAGENAME.LIST"]) {
      const list = Array.isArray(item["LANGUAGENAME.LIST"]) ? item["LANGUAGENAME.LIST"][0] : item["LANGUAGENAME.LIST"];
      if (list["NAME.LIST"]) {
        const nList = list["NAME.LIST"];
        if (nList.NAME) {
          const names = Array.isArray(nList.NAME) ? nList.NAME : [nList.NAME];
          return extractName(names[0]);
        }
      }
    }

    // Check if the item itself is just a wrapper for a string (common in some parsers)
    if (typeof item === 'object' && Object.keys(item).length === 1) {
      const val = Object.values(item)[0];
      if (typeof val === 'string') return val;
    }

    return '';
  };

  const processLedger = (l: any) => {
    const name = extractName(l);
    const parent = extractName(l.PARENT || l.PARENTNAME || l["@_PARENT"] || l["@_PARENTNAME"] || l.GROUP || l["@_GROUP"]);
    if (name) {
      ledgers.push({ name, parent: parent || '' });
    }
  };

  const processStockItem = (si: any) => {
    const name = extractName(si);
    const parent = extractName(si.PARENT || si.PARENTNAME);
    const uom = extractName(si.BASEUNITS || si.UOM);
    if (name) {
      stockItems.push({ name, parent: parent || '', uom: uom || 'Nos' });
    }
  };

  const processVoucherType = (vt: any) => {
    const name = extractName(vt);
    if (name && !voucherTypes.includes(name)) voucherTypes.push(name);
  };

  const processVoucher = (v: any) => {
    try {
      const voucherType = v.VOUCHERTYPENAME || v["@_VCHTYPE"];
      const date = v.DATE;
      const voucherNumber = v.VOUCHERNUMBER || '';
      const narration = v.NARRATION || '';
      
      // Extract ledger entries
      const entries = v["ALLLEDGERENTRIES.LIST"] || v["LEDGERENTRIES.LIST"] || [];
      const entryList = Array.isArray(entries) ? entries : [entries];
      
      if (entryList.length >= 2) {
        const first = entryList[0];
        const second = entryList[1];
        
        const ledgerName = extractName(first.LEDGERNAME || first);
        const secondLedger = extractName(second.LEDGERNAME || second);
        const amount = Math.abs(parseFloat(first.AMOUNT || '0'));
        const isDebit = (first.ISDEEMEDPOSITIVE || '').toUpperCase() === 'YES';
        const narration2 = v.NARRATION2 || '';

        if (ledgerName && voucherType && date) {
          transactions.push({
            date: date.toString(),
            voucherType: voucherType.toString(),
            voucherNumber: voucherNumber.toString(),
            ledgerName,
            secondLedger,
            amount,
            narration: narration.toString(),
            narration2: narration2.toString(),
            isDebit
          });
        }
      }
    } catch (err) {
      console.warn("Failed to process historical voucher:", err);
    }
  };

  try {
    // Clean XML: Remove leading junk
    const cleanXML = xmlContent.trim().replace(/^[^<]*/, '');
    
    // Attempt 1: Full Parse (Fastest for small/medium files)
    const result = parser.parse(cleanXML);
    
    // Iterative search to avoid stack issues during traversal
    const findAllTags = (root: any, tagName: string): any[] => {
      const results: any[] = [];
      if (!root || typeof root !== 'object') return results;
      const stack = [root];
      const seen = new Set();
      let nodeCount = 0;
      while (stack.length > 0 && nodeCount < 1000000) {
        const current = stack.pop();
        nodeCount++;
        if (!current || typeof current !== 'object' || seen.has(current)) continue;
        seen.add(current);
        
        // Fuzzy match: check if any key contains the tagName (e.g. LEDGER, LEDGER.LIST)
        for (const key in current) {
          if (key.toUpperCase().includes(tagName.toUpperCase())) {
            const items = Array.isArray(current[key]) ? current[key] : [current[key]];
            results.push(...items);
          } else if (typeof current[key] === 'object') {
            stack.push(current[key]);
          }
        }
      }
      return results;
    };

    findAllTags(result, 'LEDGER').forEach(processLedger);
    findAllTags(result, 'STOCKITEM').forEach(processStockItem);
    findAllTags(result, 'VOUCHERTYPE').forEach(processVoucherType);
    findAllTags(result, 'VOUCHER').forEach(processVoucher);

  } catch (e: any) {
    console.warn("Full XML parse failed, falling back to regex extraction:", e.message);
    
    // Attempt 2: Regex Extraction (Fallback for "too much recursion" or massive files)
    // This extracts <LEDGER> and <VOUCHERTYPE> blocks directly without building a full DOM tree
    // We use a more flexible regex to handle namespaces (e.g. <UDF:LEDGER>) and case-insensitivity
    const ledgerRegex = /<(?:[\w-]*:)?LEDGER[^>]*>([\s\S]*?)<\/(?:[\w-]*:)?LEDGER>/gi;
    const voucherTypeRegex = /<(?:[\w-]*:)?VOUCHERTYPE[^>]*>([\s\S]*?)<\/(?:[\w-]*:)?VOUCHERTYPE>/gi;
    
    let match;
    while ((match = ledgerRegex.exec(xmlContent)) !== null) {
      try {
        const parsed = parser.parse(match[0]);
        const l = parsed.LEDGER || Object.values(parsed)[0];
        if (l) processLedger(l);
      } catch (err) {}
    }
    
    while ((match = voucherTypeRegex.exec(xmlContent)) !== null) {
      try {
        const parsed = parser.parse(match[0]);
        const vt = parsed.VOUCHERTYPE || Object.values(parsed)[0];
        if (vt) processVoucherType(vt);
      } catch (err) {}
    }

    const voucherRegex = /<(?:[\w-]*:)?VOUCHER[^>]*>([\s\S]*?)<\/(?:[\w-]*:)?VOUCHER>/gi;
    while ((match = voucherRegex.exec(xmlContent)) !== null) {
      try {
        const parsed = parser.parse(match[0]);
        const v = parsed.VOUCHER || Object.values(parsed)[0];
        if (v) processVoucher(v);
      } catch (err) {}
    }

    // Attempt 3: Brute Force Regex (Last resort for highly non-standard XML)
    if (ledgers.length === 0) {
      console.warn("Structured parse and tag-specific regex failed, attempting brute force extraction...");
      // Look for any block that contains a NAME and PARENT/GROUP tag
      const genericBlockRegex = /<(?:[\w-]*:)?(?:LEDGER|GROUP|ACCOUNT|MASTER|VOUCHER)[^>]*>([\s\S]*?)<\/(?:[\w-]*:)?(?:LEDGER|GROUP|ACCOUNT|MASTER|VOUCHER)>/gi;
      const nameRegex = /<(?:[\w-]*:)?(?:NAME|LEDGERNAME|PARTYLEDGERNAME)[^>]*>(?:<!\[CDATA\[)?([^<\]]+)(?:\]\]>)?<\//i;
      const parentRegex = /<(?:[\w-]*:)?(?:PARENT|GROUPNAME|VOUCHERTYPENAME)[^>]*>(?:<!\[CDATA\[)?([^<\]]+)(?:\]\]>)?<\//i;

      let blockMatch;
      while ((blockMatch = genericBlockRegex.exec(xmlContent)) !== null) {
        const block = blockMatch[1];
        
        // For Vouchers, we might find multiple LEDGERNAMEs
        const names: string[] = [];
        let nMatch;
        const localNameRegex = new RegExp(nameRegex, 'gi');
        while ((nMatch = localNameRegex.exec(block)) !== null) {
          names.push(nMatch[1].trim());
        }

        const pMatch = parentRegex.exec(block);
        const parent = pMatch ? pMatch[1].trim() : '';

        names.forEach(name => {
          if (name && !ledgers.find(l => l.name === name)) {
            ledgers.push({ name, parent });
          }
        });
      }
    }
  }

  // If still no ledgers, try a global search for any LEDGERNAME or NAME tags
  if (ledgers.length === 0) {
    const globalNameRegex = /<(?:[\w-]*:)?(?:NAME|LEDGERNAME|PARTYLEDGERNAME)[^>]*>(?:<!\[CDATA\[)?([^<\]]+)(?:\]\]>)?<\//gi;
    let gMatch;
    while ((gMatch = globalNameRegex.exec(xmlContent)) !== null) {
      const name = gMatch[1].trim();
      if (name && name.length < 100 && !ledgers.find(l => l.name === name)) {
        ledgers.push({ name, parent: '' });
      }
    }
  }

  // Final deduplication
  const uniqueLedgers = Array.from(new Map(ledgers.map(l => [l.name, l])).values());

  // If still no ledgers, try a "Super Brute Force" search for any text that looks like a name
  if (uniqueLedgers.length === 0) {
    console.warn("All parsing attempts failed, trying super brute force...");
    // Look for anything between tags that isn't a tag itself and isn't too long
    const superBruteRegex = />([^<]{2,60})<\//g;
    let sbMatch;
    const commonTallyTags = [
      'ENVELOPE', 'HEADER', 'BODY', 'IMPORTDATA', 'REQUESTDESC', 'STATICVARIABLES', 
      'REQUESTDATA', 'TALLYMESSAGE', 'VOUCHER', 'DATE', 'VOUCHERTYPENAME', 
      'PARTYLEDGERNAME', 'PERSISTEDVIEW', 'AMOUNT', 'ISDEEMEDPOSITIVE', 
      'LEDGERNAME', 'NARRATION', 'TALLYREQUEST', 'REPORTNAME', 'SVCURRENTCOMPANY', 
      'SVEXPORTFORMAT', 'ACCOUNTTYPE', 'LEDGER', 'GROUP', 'PARENT', 'NAME', 
      'RESERVEDNAME', 'YES', 'NO', 'PRIMARY', 'DEBIT', 'CREDIT', 'TRUE', 'FALSE'
    ];
    
    while ((sbMatch = superBruteRegex.exec(xmlContent)) !== null) {
      const val = sbMatch[1].trim();
      if (val && 
          !commonTallyTags.includes(val.toUpperCase()) && 
          !val.includes('\n') && 
          !/^\d+$/.test(val) && // Not just numbers
          val.length > 1 // Ignore single chars
      ) {
        if (!ledgers.find(l => l.name === val)) {
          ledgers.push({ name: val, parent: '' });
        }
      }
    }
  }

  const finalLedgers = Array.from(new Map(ledgers.map(l => [l.name, l])).values());

  // Fallback if no voucher types found
  if (voucherTypes.length === 0) {
    voucherTypes.push('Payment', 'Receipt', 'Contra', 'Journal', 'Sales', 'Purchase');
  }

  return {
    voucherTypes: [...new Set(voucherTypes)],
    ledgers: finalLedgers,
    stockItems: Array.from(new Map(stockItems.map(si => [si.name, si])).values()),
    transactions
  };
}

export async function fetchFromTally(port: string = '9000'): Promise<TallyData> {
  const getRequestXML = (reportName: string) => `
    <ENVELOPE>
        <HEADER>
            <TALLYREQUEST>Export Data</TALLYREQUEST>
        </HEADER>
        <BODY>
            <EXPORTDATA>
                <REQUESTDESC>
                    <REPORTNAME>${reportName}</REPORTNAME>
                    <STATICVARIABLES>
                        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
                        ${reportName === 'List of Accounts' ? '<ACCOUNTTYPE>All Masters</ACCOUNTTYPE>' : ''}
                    </STATICVARIABLES>
                </REQUESTDESC>
            </EXPORTDATA>
        </BODY>
    </ENVELOPE>
  `;

  const tryFetch = async (host: string, reportName: string) => {
    const response = await fetch(`http://${host}:${port}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
      },
      body: getRequestXML(reportName),
    });
    if (!response.ok) throw new Error(`Tally status: ${response.status}`);
    return response.text();
  };

  try {
    const hosts = ['localhost', '127.0.0.1'];
    let mastersXML = '';
    let daybookXML = '';
    let lastError = null;

    for (const host of hosts) {
      try {
        mastersXML = await tryFetch(host, 'List of Accounts');
        // If masters succeed, try daybook on the same host
        try {
          daybookXML = await tryFetch(host, 'Daybook');
        } catch (e) {
          console.warn("Daybook fetch failed, continuing with masters only");
        }
        break;
      } catch (e) {
        lastError = e;
      }
    }

    if (!mastersXML) throw lastError || new Error("Could not reach Tally");

    const mastersData = await parseTallyXML(mastersXML);
    if (daybookXML) {
      const daybookData = await parseTallyXML(daybookXML);
      return {
        voucherTypes: [...new Set([...mastersData.voucherTypes, ...daybookData.voucherTypes])],
        ledgers: Array.from(new Map([...mastersData.ledgers, ...daybookData.ledgers].map(l => [l.name, l])).values()),
        stockItems: Array.from(new Map([...mastersData.stockItems, ...daybookData.stockItems].map(si => [si.name, si])).values()),
        transactions: [...(mastersData.transactions || []), ...(daybookData.transactions || [])]
      };
    }
    return mastersData;
  } catch (error: any) {
    console.error("Tally Direct Connect Error:", error);
    
    const isHttps = window.location.protocol === 'https:';
    const isNetworkError = error.name === 'TypeError' || error.message.includes('fetch');

    if (isHttps && isNetworkError) {
      throw new Error("BROWSER_BLOCK: Your browser is blocking the connection because this site is HTTPS and Tally is HTTP. Please follow the 'Insecure Content' guide in the UI.");
    }

    throw new Error("OFFLINE: Could not reach Tally. Ensure Tally is running, 'Enable HTTP Server' is Yes (Port 9000), and you are on the same machine.");
  }
}

export function generateLedgerXML(ledger: any, companyName: string = 'Imported Company'): string {
  const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: "@_", format: true });
  
  const gstin = String(ledger.gstin || '').trim();
  const registrationType = gstin ? 'Regular' : 'Unregistered';
  const stateFromGstin = gstin.length >= 2 ? (GST_STATE_CODES[gstin.substring(0, 2)] || '') : '';
  const state = ledger.state || stateFromGstin || '';
  const today = "20260401"; // Matching user's working XML date

  const isCreditor = ledger.parent.toLowerCase().includes('creditor');
  const isDebtor = ledger.parent.toLowerCase().includes('debtor');

  const xmlObj = {
    ENVELOPE: {
      "@_xmlns:UDF": "TallyUDF",
      HEADER: { TALLYREQUEST: "Import Data" },
      BODY: {
        IMPORTDATA: {
          REQUESTDESC: { REPORTNAME: "All Masters", STATICVARIABLES: { SVCURRENTCOMPANY: companyName } },
          REQUESTDATA: {
            TALLYMESSAGE: {
              "@_xmlns:UDF": "TallyUDF",
              LEDGER: {
                "@_NAME": ledger.name,
                "@_ACTION": "Create",
                "LANGUAGENAME.LIST": {
                  "NAME.LIST": { "@_TYPE": "String", NAME: ledger.name },
                  LANGUAGEID: "1033"
                },
                NAME: ledger.name,
                PARENT: ledger.parent,
                CURRENCYNAME: "₹",
                TAXTYPE: "Others",
                GSTREGISTRATIONTYPE: registrationType,
                PARTYGSTIN: gstin,
                GSTTYPE: "Goods",
                ISBILLWISEON: (isDebtor || isCreditor) ? "Yes" : "No",
                ISGSTAPPLICABLE: "Yes",
                ISDEEMEDPOSITIVE: isDebtor ? "Yes" : "No",
                COUNTRYOFRESIDENCE: "India",
                LEDGERCOUNTRYISDCODE: "+91",
                PRIORSTATENAME: state,
                OLDLEDSTATENAME: state,
                "LEDGSTREGDETAILS.LIST": [
                  {
                    APPLICABLEFROM: today,
                    GSTREGISTRATIONTYPE: registrationType,
                    PLACEOFSUPPLY: state,
                    GSTIN: gstin,
                    ISOTHTERRITORYASSESSEE: "No",
                    CONSIDERPURCHASEFOREXPORT: "No",
                    ISTRANSPORTER: "No",
                    ISCOMMONPARTY: "No"
                  }
                ],
                "LEDMAILINGDETAILS.LIST": [
                  {
                    APPLICABLEFROM: today,
                    MAILINGNAME: ledger.name,
                    ADDRESS: [ledger.address1, ledger.address2].filter(Boolean),
                    STATE: state,
                    COUNTRY: "India",
                    PINCODE: ledger.pincode || ''
                  }
                ]
              }
            }
          }
        }
      }
    }
  };
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + builder.build(xmlObj);
}

export function generateStockItemXML(item: any, companyName: string = 'Imported Company'): string {
  const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  
  const gstApplicable = item.hsnCode ? 'Applicable' : 'Not Applicable';

  const xmlObj = {
    ENVELOPE: {
      HEADER: { TALLYREQUEST: "Import Data" },
      BODY: {
        IMPORTDATA: {
          REQUESTDESC: { REPORTNAME: "All Masters", STATICVARIABLES: { SVCURRENTCOMPANY: companyName } },
          REQUESTDATA: {
            TALLYMESSAGE: {
              STOCKITEM: {
                "@_NAME": item.name,
                "@_ACTION": "Create",
                NAME: item.name,
                PARENT: item.parent,
                BASEUNITS: item.uom,
                "NAME.LIST": [
                  { NAME: item.name },
                  ...(item.alias1 ? [{ NAME: item.alias1 }] : []),
                  ...(item.alias2 ? [{ NAME: item.alias2 }] : [])
                ],
                COSTINGMETHOD: item.costingMethod || 'Avg. Cost',
                GSTAPPLICABLE: gstApplicable,
                "GSTDETAILS.LIST": [
                  {
                    APPLICABLEFROM: "20240401",
                    HSNCODE: item.hsnCode || '',
                    TAXABILITY: "Taxable",
                    "STATEWISEGSTDETAILS.LIST": [
                      {
                        STATE: "Any",
                        "GSTRATEDETAILS.LIST": [
                          { GSTRATETYPE: "Integrated Tax", GSTRATE: item.gstRate || 0 }
                        ]
                      }
                    ]
                  }
                ],
                "STANDARDPRICELIST.LIST": [
                  {
                    DATE: "20240401",
                    RATE: item.rate || 0
                  }
                ]
              }
            }
          }
        }
      }
    }
  };
  return builder.build(xmlObj);
}

export function generateMultiMasterXML(masters: { type: 'LEDGER' | 'STOCKITEM', data: any }[], companyName: string = 'Imported Company'): string {
  const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: "@_", format: true });
  
  const tallyMessages = masters.map(m => {
    if (m.type === 'LEDGER') {
      const gstin = String(m.data.gstin || '').trim();
      const registrationType = gstin ? 'Regular' : 'Unregistered';
      const stateFromGstin = gstin.length >= 2 ? (GST_STATE_CODES[gstin.substring(0, 2)] || '') : '';
      const state = m.data.state || stateFromGstin || '';
      const today = "20260401";
      const isCreditor = String(m.data.parent).toLowerCase().includes('creditor');
      const isDebtor = String(m.data.parent).toLowerCase().includes('debtor');

      return {
        "@_xmlns:UDF": "TallyUDF",
        LEDGER: {
          "@_NAME": m.data.name,
          "@_ACTION": "Create",
          "LANGUAGENAME.LIST": {
            "NAME.LIST": { "@_TYPE": "String", NAME: m.data.name },
            LANGUAGEID: "1033"
          },
          NAME: m.data.name,
          PARENT: m.data.parent,
          CURRENCYNAME: "₹",
          TAXTYPE: "Others",
          GSTREGISTRATIONTYPE: registrationType,
          PARTYGSTIN: gstin,
          GSTTYPE: "Goods",
          ISBILLWISEON: (isDebtor || isCreditor) ? "Yes" : "No",
          ISGSTAPPLICABLE: "Yes",
          ISDEEMEDPOSITIVE: isDebtor ? "Yes" : "No",
          COUNTRYOFRESIDENCE: "India",
          LEDGERCOUNTRYISDCODE: "+91",
          PRIORSTATENAME: state,
          OLDLEDSTATENAME: state,
          "LEDGSTREGDETAILS.LIST": [
            {
              APPLICABLEFROM: today,
              GSTREGISTRATIONTYPE: registrationType,
              PLACEOFSUPPLY: state,
              GSTIN: gstin,
              ISOTHTERRITORYASSESSEE: "No",
              CONSIDERPURCHASEFOREXPORT: "No",
              ISTRANSPORTER: "No",
              ISCOMMONPARTY: "No"
            }
          ],
          "LEDMAILINGDETAILS.LIST": [
            {
              APPLICABLEFROM: today,
              MAILINGNAME: m.data.name,
              ADDRESS: [m.data.address1, m.data.address2].filter(Boolean),
              STATE: state,
              COUNTRY: "India",
              PINCODE: m.data.pincode || ''
            }
          ]
        }
      };
    } else {
      const gstApplicable = m.data.hsnCode ? 'Applicable' : 'Not Applicable';
      return {
        "@_xmlns:UDF": "TallyUDF",
        STOCKITEM: {
          "@_NAME": m.data.name,
          "@_ACTION": "Create",
          NAME: m.data.name,
          PARENT: m.data.parent,
          BASEUNITS: m.data.uom,
          "NAME.LIST": [
            { NAME: m.data.name },
            ...(m.data.alias1 ? [{ NAME: m.data.alias1 }] : []),
            ...(m.data.alias2 ? [{ NAME: m.data.alias2 }] : [])
          ],
          COSTINGMETHOD: m.data.costingMethod || 'Avg. Cost',
          GSTAPPLICABLE: gstApplicable,
          "GSTDETAILS.LIST": [
            {
              APPLICABLEFROM: "20240401",
              HSNCODE: m.data.hsnCode || '',
              TAXABILITY: "Taxable",
              "STATEWISEGSTDETAILS.LIST": [
                {
                  STATE: "Any",
                  "GSTRATEDETAILS.LIST": [
                    { GSTRATETYPE: "Integrated Tax", GSTRATE: m.data.gstRate || 0 }
                  ]
                }
              ]
            }
          ],
          "STANDARDPRICELIST.LIST": [
            {
              DATE: "20240401",
              RATE: m.data.rate || 0
            }
          ]
        }
      };
    }
  });

  const xmlObj = {
    ENVELOPE: {
      "@_xmlns:UDF": "TallyUDF",
      HEADER: { TALLYREQUEST: "Import Data" },
      BODY: {
        IMPORTDATA: {
          REQUESTDESC: { REPORTNAME: "All Masters", STATICVARIABLES: { SVCURRENTCOMPANY: companyName } },
          REQUESTDATA: {
            TALLYMESSAGE: tallyMessages
          }
        }
      }
    }
  };
  return builder.build(xmlObj);
}

export function generateTallyXML(vouchers: Voucher[], companyName: string = 'Imported Company'): string {
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    format: true,
    indentBy: "  "
  });

  const tallyMessages = vouchers.map(v => {
    const vt = v.voucherType.toLowerCase();
    const isSales = vt.includes('sales');
    const isPurchase = vt.includes('purchase');
    const isJournal = vt.includes('journal');
    
    // Determine Party Ledger Name
    const partyLedgerName = v.secondLedger || (isSales ? 'Cash' : 'Cash');
    
    let ledgerEntries: any[] = [];
    let inventoryEntries: any[] = [];
    let otherSum = 0; // Tracking net Dr/Cr to balance the Party Ledger (Debit is positive, Credit is negative)

    // 1. Process Item Inventory if present
    if (v.inventoryEntries && v.inventoryEntries.length > 0) {
      inventoryEntries = v.inventoryEntries.map(ie => {
        const isItemDebit = !isSales; // Purchase = Dr (True), Sales = Cr (False)
        const amt = isItemDebit ? ie.amount : -ie.amount;
        otherSum += amt;
        
        return {
          STOCKITEMNAME: ie.stockItemName,
          ISDEEMEDPOSITIVE: isItemDebit ? "Yes" : "No",
          RATE: ie.rate.toFixed(2),
          ACTUALQTY: ie.quantity,
          BILLEDQTY: ie.quantity,
          AMOUNT: (-amt).toFixed(2), // Negative for Debit, Positive for Credit in Item context usually? 
          // Actually Tally is weird. For Invoice, Item Amount is often positive but its accounting allocation handles the sign.
          "BATCHALLOCATIONS.LIST": [
            {
              GODOWNNAME: "Main Location",
              BATCHNAME: "Primary Batch",
              AMOUNT: (-amt).toFixed(2)
            }
          ],
          "ACCOUNTINGALLOCATIONS.LIST": [
            {
              LEDGERNAME: v.ledgerName, // The Sales/Purchase account
              ISDEEMEDPOSITIVE: isItemDebit ? "Yes" : "No",
              AMOUNT: (-amt).toFixed(2)
            }
          ],
          ...(ie.hsn ? {
            "GSTOVRDETAILS.LIST": [
              {
                HSNCODE: ie.hsn,
                HSNSOURCETYPE: "Specify Details Here"
              }
            ]
          } : {})
        };
      });
    } else if (!isJournal && !isSales && !isPurchase) {
      // For Receipt/Payment/Contra if no inventory
      const mainAmt = v.isDebit ? v.amount : -v.amount;
      ledgerEntries.push({
        LEDGERNAME: v.ledgerName,
        ISDEEMEDPOSITIVE: v.isDebit ? "Yes" : "No",
        AMOUNT: (-mainAmt).toFixed(2)
      });
      otherSum += mainAmt;
    } else if (isJournal || ((isSales || isPurchase) && (!v.inventoryEntries || v.inventoryEntries.length === 0))) {
      // Accounting-only Sales/Purchase or Journal
      const mainAmt = v.isDebit ? v.amount : -v.amount;
      ledgerEntries.push({
        LEDGERNAME: v.ledgerName,
        ISDEEMEDPOSITIVE: v.isDebit ? "Yes" : "No",
        AMOUNT: (-mainAmt).toFixed(2)
      });
      otherSum += mainAmt;
    }

    // 2. Add Additional Ledgers (GST, Round Off, etc.)
    const additionalLedgers: any[] = [];
    if (v.ledgerEntries && v.ledgerEntries.length > 0) {
      v.ledgerEntries.forEach(le => {
        const amt = le.isDebit ? le.amount : -le.amount;
        otherSum += amt;
        const lowerName = le.ledgerName.toLowerCase();
        const isGST = lowerName.includes('gst') || lowerName.includes('tax');
        
        additionalLedgers.push({
          LEDGERNAME: le.ledgerName,
          METHODTYPE: isGST ? "GST" : undefined,
          ISDEEMEDPOSITIVE: le.isDebit ? "Yes" : "No",
          AMOUNT: (-amt).toFixed(2)
        });
      });
    }

    // 3. Add the Balancing Party Ledger - Place it FIRST as Tally often prefers
    const partyAmount = -otherSum;
    const isPartyDebit = partyAmount > 0;
    
    const finalLedgerEntries = [
      {
        LEDGERNAME: partyLedgerName,
        ISDEEMEDPOSITIVE: isPartyDebit ? "Yes" : "No",
        AMOUNT: (-partyAmount).toFixed(2),
        ISPARTYLEDGER: "Yes"
      },
      ...additionalLedgers,
      ...ledgerEntries
    ];

    const isInvoice = isSales || isPurchase;
    const vDate = String(v.date || '').replace(/-/g, '');
    const guid = `ais-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return {
      VOUCHER: {
        "@_VCHTYPE": v.voucherType,
        "@_ACTION": "Create",
        "@_OBJVIEW": isInvoice ? "Invoice Voucher View" : "Accounting Voucher View",
        DATE: vDate,
        VOUCHERTYPENAME: v.voucherType,
        VOUCHERNUMBER: v.voucherNumber || '',
        PARTYLEDGERNAME: partyLedgerName,
        ISINVOICE: isInvoice ? "Yes" : "No",
        REFERENCE: v.reference || '',
        REFERENCEDATE: v.referenceDate ? String(v.referenceDate).replace(/-/g, '') : vDate,
        VCHSTATUSDATE: vDate,
        GUID: guid,
        "ALLINVENTORYENTRIES.LIST": inventoryEntries,
        "LEDGERENTRIES.LIST": finalLedgerEntries,
        NARRATION: v.narration2 ? `${v.narration}\n${v.narration2}` : v.narration
      }
    };
  });

  const xmlObj = {
    ENVELOPE: {
      HEADER: {
        TALLYREQUEST: "Import Data"
      },
      BODY: {
        IMPORTDATA: {
          REQUESTDESC: {
            REPORTNAME: "All Masters",
            STATICVARIABLES: {
              SVCURRENTCOMPANY: companyName
            }
          },
          REQUESTDATA: {
            TALLYMESSAGE: [
              ...tallyMessages.map(m => ({
                "@_xmlns:UDF": "TallyUDF",
                ...m
              })),
              {
                "@_xmlns:UDF": "TallyUDF",
                COMPANY: {
                  "REMOTECMPINFO.LIST": {
                    "@_MERGE": "Yes",
                    REMOTECMPNAME: companyName
                  }
                }
              }
            ]
          }
        }
      }
    }
  };

  return builder.build(xmlObj);
}
