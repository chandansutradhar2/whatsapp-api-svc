const axios = require("axios").default;
var mysql = require("mysql");
var XLSX = require("xlsx");
const xl = require("excel4node");

const sqlConfig = require("../sqlconfig");

var con = mysql.createConnection({
	host: sqlConfig.host,
	user: sqlConfig.username,
	password: sqlConfig.password,
	database: sqlConfig.dbName,
});

exports.sendNotification = (req, res) => {
	let reconResults = [];
	let excelResults = [];
	let societies = [];
	con.connect(function (err) {
		if (err) throw err;
		//1: query db for authorizer
		con.query(
			sqlConfig.findAuthorizerQuery,
			async function (err, results, fields) {
				if (err) throw err; //return back with db connection error
				//2: identify unqiue tenantids
				//console.log("result form first query", results);
				const tenantIds = [...new Set(results.map((item) => item.tenantid))];

				let societyNames = [
					...new Set(results.map((item) => item.societyName)),
				];

				if (societyNames.length !== tenantIds.length) {
					return res.status(501).send("societyName and TenantId not matches");
				}

				let len = tenantIds.length;
				for (let index = 0; index < len; index++) {
					societies.push({
						name: societyNames[index],
						tenantId: tenantIds[index],
					});
				}

				console.log(societies);
				//3: for each tenant, fetch recon data using query
				for (const tenant of societies) {
					console.log("processing tenant record for ", tenant.tenantId);
					let tmp = await fetchReconData(con, tenant.tenantId);
					let excelTmp = await fetchExcelData(con, tenant.tenantId);
					console.log("exceltmp value", excelTmp);

					console.log("tmp value", tmp);
					tmp.length > 0 ? reconResults.push(tmp[0]) : null;
					excelTmp.length > 0 ? excelResults.push(excelTmp[0]) : null;
				}
				console.log("reconResults Array", reconResults);
				console.log("excelArry", excelResults);
				createTableDemo(excelResults, societies);
				res.send("done");
			},
		);
	});
};

async function createTableDemo(tableData, societies) {
	for (const table of societies) {
		const wb = new xl.Workbook({
			jszip: {
				compression: "DEFLATE",
			},

			dateFormat: "m/d/yy hh:mm:ss",
		});
		const ws = wb.addWorksheet(
			`${new Date().getDate().toLocaleString()}-${new Date().getMonth()}-22`,
		);
		const headingColumnNames = [
			"Flat No",
			"Customer Name",
			"Contact No",
			"Raised Amount",
			"Received Amount",
			"Pending Amount",
			"Payment Method",
			"RRN No",
			"TXN ID",
			"Created On",
		];

		let startRow = 1;
		let startCol = 1;
		headingColumnNames.forEach((heading) => {
			ws.cell(startRow, startCol).string(heading);
			startCol = startCol + 1;
		});

		//for col that needs to be created
		let startRow2 = 2;
		tableData.forEach((table, idx) => {
			//	console.log(table);
			let startCol = 1;

			for (const prop in table) {
				console.log(`${prop}: ${table[prop]}`);
				if (table[prop] === null || table[prop] === undefined) {
					ws.cell(startRow2, startCol).string();
				} else if (typeof table[prop] == "number") {
					ws.cell(startRow2, startCol).number(table[prop]);
				} else if (typeof table[prop] == "string") {
					ws.cell(startRow2, startCol).string(table[prop].toString());
				} else {
					ws.cell(startRow2, startCol).string(table[prop]);
				}
				startCol = startCol + 1;
			}
			startRow2 = startRow2 + 1;
		});

		wb.write(`./reconfiles/recon-${table.name}.xlsx`);
	}
}

// async function createTable(tableData, societies) {
// 	//var data = XLSX.write(workbook, opts);
// 	for (const table of societies) {
// 		const wb = new xl.Workbook({
// 			jszip: {
// 				compression: "DEFLATE",
// 			},
// 			defaultFont: {
// 				size: 12,
// 				name: "Calibri",
// 				color: "FFFFFFFF",
// 			},
// 			dateFormat: "m/d/yy hh:mm:ss",
// 		});
// 		const ws = wb.addWorksheet(`${new Date().getDate().toLocaleString()}`);
// 		const headingColumnNames = [
// 			"Flat No",
// 			"Customer Name",
// 			"Contact No",
// 			"Raised Amount",
// 			"Received Amount",
// 			"Pending Amount",
// 			"Payment Method",
// 			"RRN No",
// 			"TXN ID",
// 			"Created On",
// 		];

// 		headingColumnNames.forEach((heading, idx) => {
// 			ws.column();
// 		});

// 		// tableData.forEach((record) => {
// 		// 	let columnIndex = 1;
// 		// 	Object.keys(record).forEach((columnName) => {
// 		// 		ws.cell(rowIndex, columnIndex++).string(record[columnName]);
// 		// 	});
// 		// 	rowIndex++;
// 		// });
// 		wb.write(`./reconfiles/Recon-${table.name}.xlsx`);
// 	}
// }

async function fetchReconData(con, tenantId) {
	return new Promise((resolve, reject) => {
		con.query(
			`SELECT SUM(totalraisedCount) 'Raised Count',SUM(totalraisedAmount) 'Raised Amount',SUM(pendingCount) 'Pending Count',
SUM(pendingAmount) 'Pending Amount',SUM(onlinepaymentCount) 'Online Payment Count',SUM(onlinepaymentAmount) 'Online Payment Amount',
SUM(offlinepaymentCount) 'Offline Payment Count',SUM(offlinepaymentAmount) 'Offline Payment Amount' FROM (
SELECT 	tn.name,    COUNT(1) totalraisedCount,    SUM(amount) totalraisedAmount,    SUM(CASE
        WHEN tr.status NOT IN (2 , 12) THEN 1 ELSE 0 END) pendingCount,   
    SUM(CASE
        WHEN tr.status NOT IN (2 , 12) THEN amount
        ELSE 0
    END) pendingAmount,   
    0 onlinepaymentCount,
    0 onlinepaymentAmount,
    0 offlinepaymentCount,
    0 offlinepaymentAmount
    FROM
    transaction tr join tenant tn on tn.tenantid=tr.societytenantid
    WHERE
    societytenantid = ${tenantId} AND type = 150 and DATE(tr.raised_date) >= '2022-05-01' and DATE(tr.raised_date) <= '2022-05-31'
UNION SELECT 
tn.name,
    0 totalraisedCount,     0 totalraisedAmount,
    0 pendingCount,    0 pendingAmount,
    
    SUM(CASE
        WHEN tr.payment_method IN ('DC' , 'QR PAYMENT', 'UPI') THEN 1
        ELSE 0
    END) onlinepaymentCount,
    SUM(CASE
        WHEN tr.payment_method IN ('DC' , 'QR PAYMENT', 'UPI') THEN amount
        ELSE 0
    END) onlinepaymentAmount,
    SUM(CASE
        WHEN
            tr.payment_method IN ('Cash' , 'Cheque', 'NEFT/RTGS', 'CASH', 'Cheque', 'BalanceDue')
        THEN
            1
        ELSE 0
    END) offlinepaymentCount,
    SUM(CASE
        WHEN
            tr.payment_method IN ('Cash' , 'Cheque', 'NEFT/RTGS', 'CASH', 'Cheque', 'BalanceDue')
        THEN
            amount
        ELSE 0
    END) offlinepaymentAmount
FROM
    transaction tr
    join tenant tn on tn.tenantid=tr.societytenantid
WHERE
    tr.societytenantid = ${tenantId} and DATE(tr.raised_date) >= '2022-05-01' and DATE(tr.raised_date) <= '2022-05-31'
    ) vw;
    `,
			(err, results, fields) => {
				if (err) reject(err);
				resolve(results);
			},
		);
	});
}

async function fetchExcelData(con, tenantId) {
	return new Promise((resolve, reject) => {
		con.query(
			`
SELECT CONCAT(coo.code, '-', fd.flatno) 'Flat No',
us.firstName 'Customer Name',
us.msisdn 'Contact No',
tr.grandtotal 'Raised Amount',
tr.paidamount 'Received Amount',
ROUND(tr.grandtotal - tr.paidamount) 'Pending Amount',
tr.payment_method 'Payment Method',
trr.rrn 'RRN No',
pgr.txnid 'txnid',
pgr.created_on
   FROM transaction tr
   JOIN transactionrrnbinder trr ON trr.txnpkid = tr.id
   JOIN pg_response pgr ON pgr.udf1 = trr.rrn
   JOIN tenant tn ON tr.societytenantid = tn.tenantid
   JOIN users us ON us.userid = tr.societyuserid
   JOIN flatmemberassociation fma on fma.userId = us.userid
   and tr.flatdetailsid=fma.flatdetailsid
   and fma.status=1
   JOIN flatdetails fd on fd.flatdetailsid = tr.flatdetailsid
   JOIN code coo on fd.wing = coo.codeid
   WHERE pgr.txn_status='TS' AND tn.tenantid=${tenantId}
   order by created_on DESC`,
			(err, results, fields) => {
				if (err) reject(err);
				resolve(results);
			},
		);
	});
}

async function sendExcel() {
	//todo: whatsapp api call using axios to send excel file as content type
}

async function sendTemplate() {
	//todo: whatsapp api call using axios to send parameter with template id
}
