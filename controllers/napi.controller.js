const axios = require("axios").default;
var mysql = require("mysql");
var XLSX = require("xlsx");
const xl = require("excel4node");
const PDFDocument = require("pdfkit-table");
const fs = require("fs");

const sqlConfig = require("../sqlconfig");

var pool = mysql.createPool({
	host: sqlConfig.host,
	user: sqlConfig.username,
	password: sqlConfig.password,
	database: sqlConfig.dbName,
});

exports.sendNotification = (req, res) => {
	console.log(req.body.data);
	for(let reqData of req.body.data){
		console.log(reqData);
		let societies = [];
		//1: query db for authorizer
		pool.query(
			`SELECT t.tenantid,t.name 'societyName',t.address 'Society Address', u.firstName 'authorizerName',u.msisdn 'mobileNumber'
			from tenant as t
			JOIN usertenantassociation uta on t.tenantid  =  uta.tenantid
			JOIN users u on uta.userid = u.userId
			WHERE (uta.usertype =12 and uta.status = 1 and u.status =1 and t.tenantid = ${reqData})
			GROUP by t.tenantid, uta.userId`,
			async function (err, results, fields) {
				if (err) throw err; 
				//return back with db connection error
				//2: identify unqiue tenantids
				//console.log("result form first query", results);
				const tenantIds = [...new Set(results.map((item) => item.tenantid))];

				let societyNames = [
					...new Set(results.map((item) => item.societyName)),
				];
				let authorizerName = [ ... new Set(results.map((item) => item.authorizerName))];
				let mobileNumber = [ ... new Set(results.map((item) => item.mobileNumber))];
				if (societyNames.length !== tenantIds.length) {
					return res.status(501).send("societyName and TenantId not matches");
				}

				let len = tenantIds.length;
				for (let index = 0; index < len; index++) {
					societies.push({
						name: societyNames[index],
						tenantId: tenantIds[index],
						authorizerName: authorizerName[index],
						mobileNumber: mobileNumber[index]
					});
				}

				console.log(societies);
				//3: for each tenant, fetch recon data using query
				for (const tenant of societies) {
					let reconResults = [];
					let excelResults = [];
					console.log("processing tenant record for ", tenant.tenantId);
					let tmp = await fetchReconData(tenant.tenantId);
					let excelTmp = await fetchExcelData( tenant.tenantId);
					console.log("exceltmp value", excelTmp);

					console.log("tmp value", tmp);
					//sendTemplate(whatsappdata);
					tmp.length > 0 ? reconResults.push(tmp[0]) : null;
					if(excelTmp.length > 0){
						excelTmp.forEach(item =>{
							excelResults.push(item);
						})
					}
					await createPdf(excelResults, societies);
					console.log("reconResults Array", reconResults);
					console.log("excelArry", excelResults);
					
				}
				//createTableDemo(excelResults, societies);
				// let whatsappdata = {
				// 	"from": '918920724833',
				// 	"to": '919920346114',
				// 	"type": 'template',
				// 	"message": {
				// 		"templateid": "11995",
				// 		"placeholders": [tenant.name,(tmp[0].RaisedCount).toString(),(tmp[0].RaisedAmount).toString(),(tmp[0].OnlinePaymentCount).toString(),(tmp[0].OnlinePaymentAmount).toString(),(tmp[0].PendingCount).toString(),(tmp[0].PendingAmount).toString()]
				// 	}
				// }
				//sendTemplate(whatsappdata);
				res.send("done");
			},
		);
	}
};

async function getAuthorizerDetails(tid){
	return new Promise((resolve, reject) => {
		try {
			pool.query(
			`SELECT t.tenantid,t.name 'societyName',t.address 'Society Address', u.firstName 'authorizerName',u.msisdn 'mobileNumber'
			from tenant as t
			JOIN usertenantassociation uta on t.tenantid  =  uta.tenantid
			JOIN users u on uta.userid = u.userId
			WHERE (uta.usertype =12 and uta.status = 1 and u.status =1 and t.tenantid = ${tid})
			GROUP by t.tenantid, uta.userId`,
			(err, results, fields) => {
				if (err) reject(err);
				resolve(results);
			},);
		} catch (error) {
			
		}
	})
}

async function createPdf(tableData, societies){
	console.log("PDF Method Called");
	//console.log(tableData);
	for (const restable of societies) {

		const headingColumnNames = [
			{ label: "Flat No", property: 'flatNo', width: 60, renderer: null },
			{ label: "Customer Name", property: 'custName', width: 60, renderer: null },
			{ label: "Contact No", property: 'contactNo', width: 60, renderer: null },
			{ label: "Raised Amount", property: 'raisedamt', width: 35, renderer: null },
			{ label: "Received Amount", property: 'receivedamt', width:40, renderer: null },
			{ label: "Pending Amount", property: 'pendingamt', width: 35, renderer: null },
			{ label: "Payment Method", property: 'paymentmethod', width: 35, renderer: null },
			{ label: "RRN No", property: 'rrnNo', width: 100, renderer: null },
			{ label: "TXN ID", property: 'txnid', width: 100, renderer: null },
			{ label: "Created On", property: 'createdon', width: 50, renderer: null },
		];

		const tableRows = [];

		tableData.forEach((emptable, idx) => {
			console.log(emptable.created_on.toISOString().replace(/T/, ' ').replace(/\..+/, '').toString());
			//emptable.created_on.getDate() + '/' + (emptable.created_on.getMonth()+1) + '/' + emptable.created_on.getFullYear()
			let newTblRows = [emptable.FlatNo,emptable.CustomerName,emptable.ContactNo,emptable.RaisedAmount.toString(), emptable.ReceivedAmount.toString(), emptable.PendingAmount.toString(), emptable.PaymentMethod, emptable.RRNNo, emptable.txnid, emptable.created_on.toISOString().replace(/T/, ' ').replace(/\..+/, '').toString()];
			tableRows.push(newTblRows);
		});
		//console.log(tableRows);

		// init document
		let doc = new PDFDocument({ margin: 20, size: 'A4' });
		// save document
		doc.pipe(fs.createWriteStream(`./reconfiles/recon-${restable.name.replace(/ /g,"_")}.pdf`));
		// table 
		const table = {
			title: "Title",
			subtitle: "",
			headers: headingColumnNames,
			rows: tableRows
		  };
		  // A4 595.28 x 841.89 (portrait) (about width sizes)
		  // width
		  await doc.table(table, {
			  width: 500,
			prepareHeader: () => doc.font("Helvetica-Bold").fontSize(8),
			prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
				doc.font("Helvetica").fontSize(8);
				indexColumn === 0 && doc.addBackground(rectRow, 'blue', 0.15);
			},
		  });
		  // done!
		  doc.end();
		
	}
}

async function createTableDemo(tableData, societies) {
	for (const table of societies) {
		const wb = new xl.Workbook({
			jszip: {
				compression: "DEFLATE",
			},

			dateFormat: "m/d/yy hh:mm:ss",
		});
		const ws = wb.addWorksheet(
			`${new Date().getDate().toLocaleString()}-${new Date().toLocaleString('default', { month: 'long' })}-${new Date().getFullYear()}`,
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
			console.log(table);
			let startCol = 1;
			for (const prop in table) {
				//console.log(`${prop}: ${table[prop]}`);
				console.log("Type of received: ", typeof table[prop]);
				if (table[prop] === null || table[prop] === undefined) {
					ws.cell(startRow2, startCol).string();
				} else if (typeof table[prop] == "number") {
					ws.cell(startRow2, startCol).number(table[prop]);
				} else if (typeof table[prop] == "string") {
					ws.cell(startRow2, startCol).string(table[prop].toString());
				} else if (typeof table[prop] == "object") {
					ws.cell(startRow2, startCol).date(table[prop]).style({numberFormat: 'yyyy-mm-dd hh:mm:ss'});
				} else {
					ws.cell(startRow2, startCol).string(table[prop]);
				}
				startCol = startCol + 1;
			}
			startRow2 = startRow2 + 1;
		});

		wb.write(`./reconfiles/recon-${table.name.replace(/ /g,"_")}.xlsx`);
		//sendTemplate();
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

async function fetchReconData(tenantId) {
	return new Promise((resolve, reject) => {
		pool.query(
			`SELECT SUM(totalraisedCount) 'RaisedCount',SUM(totalraisedAmount) 'RaisedAmount',SUM(pendingCount) 'PendingCount',
				SUM(pendingAmount) 'PendingAmount',SUM(onlinepaymentCount) 'OnlinePaymentCount',SUM(onlinepaymentAmount) 'OnlinePaymentAmount',
				SUM(offlinepaymentCount) 'OfflinePaymentCount',SUM(offlinepaymentAmount) 'OfflinePaymentAmount' FROM (
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

async function fetchExcelData(tenantId) {
	return new Promise((resolve, reject) => {
		try {
			pool.query(
				`SELECT CONCAT(coo.code, '-', fd.flatno) 'FlatNo',
				us.firstName 'CustomerName',
				us.msisdn 'ContactNo',
				tr.grandtotal 'RaisedAmount',
				tr.paidamount 'ReceivedAmount',
				ROUND(tr.grandtotal - tr.paidamount) 'PendingAmount',
				tr.payment_method 'PaymentMethod',
				trr.rrn 'RRNNo',
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
		} catch (error) {
			console.log("Catch error", error);
		}
	});
}

async function sendExcel() {
	//todo: whatsapp api call using axios to send excel file as content type
}

async function sendTemplate(whatsappdata) {
	//todo: whatsapp api call using axios to send parameter with template id
	console.log('Method Called', whatsappdata);
	let axiosConfig = {
		headers: {
			'Content-Type': 'application/json',
				'apikey' : 'a089b0e1-a1f5-11ec-a7c7-9606c7e32d76'
		}
	  };
	try{
		await axios.post('https://api.pinbot.ai/v1/wamessage/send', whatsappdata, axiosConfig)
		.then((res) => {
			//console.log("RESPONSE RECEIVED: ", res);
		})
		.catch((err) => {
			console.log("AXIOS ERROR: ", err);
		})
	}catch (error) {
		console.error(error)
	}
}
