const axios = require("axios").default;
var mysql = require("mysql");
var XLSX = require("xlsx");
const xl = require("excel4node");
const PDFDocument = require("pdfkit-table");
const fs = require("fs");
const { v4: uuidv4 } = require('uuid');

var SSH2Promise = require('ssh2-promise');

var sshconfig = {
	host:"103.127.31.152",
	port:"2222",
	username: "devteam_karan",
	password: "K@ran#131",
}

var ssh = new SSH2Promise(sshconfig);
var sftp = ssh.sftp()

const sqlConfig = require("../sqlconfig");
const { resolve } = require("path");

var pool = mysql.createPool({
	host: sqlConfig.host,
	user: sqlConfig.username,
	password: sqlConfig.password,
	database: sqlConfig.dbName,
});

exports.sendNotification = (req, res) => {
	//console.log(req.body.data);
	let tenantIds = req.body.data;
	let societies = [];
	let authorizers = [];
	let reconResults = [];
	let excelResults = [];
	//1: query db for authorizer
	pool.query(
		`SELECT t.tenantid,t.name 'societyName',td.city  'City',t.address 'Society Address', u.firstName 'authorizerName',u.msisdn 'mobileNumber'
		from tenant as t
		JOIN tenantdetails td on td.tenantid = t.tenantid
		JOIN usertenantassociation uta on t.tenantid  =  uta.tenantid
		JOIN users u on uta.userid = u.userId
		WHERE (uta.usertype =12 and uta.status = 1 and u.status =1) and (t.tenantid IN (${tenantIds}))
		GROUP by t.tenantid, uta.userId`,
		async function (err, results, fields) {
			
			//console.log(results);
			if (err) throw err;
			authorizers = results;

			for (const id of tenantIds) {
				let tmp = await fetchReconData(id);
				societies.push({ tenantid: id, authorizerData: [], fileName: '', excelfileName: '', reconData: tmp[0], excelData: [] ,msgs:[]});
			}
			societies.forEach((society, idx) => {
				authorizers.forEach(auth => {
					auth.tenantid == society.tenantid ? societies[idx].authorizerData.push(auth) : null;
				})
			})
			let index = 0;
			for(const tid of tenantIds){
				let excelTmp = await fetchExcelData(tid);
				excelTmp.forEach(ele=>{
					societies[index].excelData.push(ele);
				})
				index++;
			}
			for(const soc of societies){
				let fileName = await createPdf(soc);
				soc.fileName = fileName;
				let excName = await createTableDemo(soc);
				soc.excelfileName = excName;
			}
			let whatsappdata = [];
			// current timestamp in milliseconds
			let ts = Date.now();

			let date_ob = new Date(ts);
			var day = ("0" + date_ob.getDate()).slice(-2);
			var month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
			let year = date_ob.getFullYear();

			// prints date & time in YYYY-MM-DD format
			console.log(year + "-" + month + "-" + day);
			societies.forEach((society, idx) => {
				society.authorizerData.forEach(authorizer => {
					//console.log(element.tenantid);
					societies[idx].msgs.push({
						"tenantId": society.tenantid,
						"from": '918920724833',
						"to": '919920346114',
						"type": 'template',
						"message": {
							"templateid": "12202",
							"url":"https://recon.timepayonline.com/recon/"+ society.fileName,
							"filename": society.fileName,
							"placeholders": [authorizer.societyName, authorizer.City, day+ "-"+ month + "-" + year, 
											society.reconData.RaisedCount.toString(), society.reconData.RaisedAmount.toString(), 
											society.reconData.OnlinePaymentCount.toString(), 
											society.reconData.OnlinePaymentAmount.toString(), society.reconData.PendingCount.toString(), 
											society.reconData.PendingAmount.toString(),"Shabnam"]
						}
					})
					//console.log(whatsappdata);
				});
			})
			//let ref = await sendToRemoteServer(societies);
			//console.log(typeof ref);
			await sendTemplate(societies);
			res.send("done");
		},
	);
};



async function createPdf(society) {
	return new Promise((resolve, reject) => {
		console.log("PDF Method Called");

		const headingColumnNames = [
			{ label: "Flat No", property: 'flatNo', width: 80, renderer: null },
			{ label: "Customer Name", property: 'custName', width: 80, renderer: null },
			// { label: "Contact No", property: 'contactNo', width: 60, renderer: null },
			{ label: "Raised Amount", property: 'raisedamt', width: 80, renderer: null },
			{ label: "Received Amount", property: 'receivedamt', width: 60, renderer: null },
			{ label: "Pending Amount", property: 'pendingamt', width: 60, renderer: null },
			{ label: "Payment Method", property: 'paymentmethod', width: 60, renderer: null },
			{ label: "RRN No", property: 'rrnNo', width: 120, renderer: null },
			{ label: "TXN ID", property: 'txnid', width: 120, renderer: null },
			{ label: "Created On", property: 'createdon', width: 120, renderer: null },
		];

		const tableRows = [];

		society.excelData.forEach((emptable, idx) => {
			//emptable.created_on.getDate() + '/' + (emptable.created_on.getMonth()+1) + '/' + emptable.created_on.getFullYear()
			let newTblRows = [emptable.FlatNo, emptable.CustomerName, emptable.RaisedAmount.toString(), emptable.ReceivedAmount.toString(), emptable.PendingAmount.toString() , "UPI", emptable.RRNNo, emptable.txnid, emptable.created_on.toISOString().replace(/T/, ' ').replace(/\..+/, '').toString()];
			tableRows.push(newTblRows);
		});
		//console.log(tableRows);

		// init document
		let doc = new PDFDocument({ margin: 20, size: 'A4',layout : 'landscape' });
		// save document
		let filName = uuidv4();
		doc.pipe(fs.createWriteStream(`./recon/${filName}.pdf`));



		// table 
		const table = {
			title: "Title",
			subtitle: "",
			headers: headingColumnNames,
			rows: tableRows
		};
		// A4 595.28 x 841.89 (portrait) (about width sizes)
		// width
		doc.table(table, {
			prepareHeader: () => doc.font("Helvetica-Bold").fontSize(8),
			prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
				doc.font("Helvetica").fontSize(8);
				indexColumn === 0 && doc.addBackground(rectRow, 'blue', 0.15);
			},
		});
		// done!
		doc.end();
		resolve(`${filName}.pdf`);
	})
}

async function sendToRemoteServer(societies){
	return new Promise((resolve, reject) => {
		//Promise
		ssh.connect().then(() => {
		console.log("Connection established");
		societies.forEach(ele => {
				sftp.fastPut(`./recon/${ele.fileName}`, `/home/devteam_karan/recon/${ele.fileName}`).then(()=>{
					console.log("Uploaded Successfully", ele.fileName);
				}).catch((err)=>{
					console.log(err);
				}).finally(()=>{
					ssh.close();
				})

			});	
		})
		resolve(true)
	});
}

function readPdfFile(){
	return new Promise((resolve,reject) => {
		let fileNames = [];
		fs.readdirSync(`./recon/`, function(err, filenames) {
			if (err) {
				reject(err);
				return;
			}
			filenames.forEach(function(filename) {
				fs.readFileSync(`./recon/` + filename, 'utf-8', function(err, content) {
				if (err) {
					reject(err);
					return;
				}

				console.log("reading files", filename);
				fileNames.push(filename)
				
				
				//onFileContent(filename, content);
				});
			});
		});
		fileNames.length > 0 ?resolve(fileNames): reject("Couldnt ready any file")
	})
}

async function createTableDemo(societies) {
	return new Promise((resolve, reject) => {
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
			"Raised Amount",
			"Received Amount",
			"Pending Amount",
			"Payment Method",
			"RRN No",
			"TXN ID",
			"Created On",
			"Status",
		];
	
		let startRow = 1;
		let startCol = 1;
		headingColumnNames.forEach((heading) => {
			ws.cell(startRow, startCol).string(heading);
			startCol = startCol + 1;
		});
	
		//for col that needs to be created
		let startRow2 = 2;
		societies.excelData.forEach((table, idx) => {
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
					ws.cell(startRow2, startCol).date(table[prop]).style({ numberFormat: 'yyyy-mm-dd hh:mm:ss' });
				} else {
					ws.cell(startRow2, startCol).string(table[prop]);
				}
				startCol = startCol + 1;
			}
			startRow2 = startRow2 + 1;
		});
		let fileName = uuidv4();
		wb.write(`./reconfiles/${fileName}.xlsx`);
		resolve(fileName);
	})
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
					societytenantid = ${tenantId} AND type = 150 and DATE(tr.raised_date) >= '2022-06-01' and DATE(tr.raised_date) <= '2022-06-30'
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
					tr.societytenantid = ${tenantId} and DATE(tr.raised_date) >= '2022-06-01' and DATE(tr.raised_date) <= '2022-06-30'
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
				`SELECT CONCAT(fd.flatno , '-', c.code) 'FlatNo',pcl.customer_name 'CustomerName',tr.grandtotal 'RaisedAmount', pcl.amount 'ReceivedAmount' ,
				ROUND(tr.grandtotal - pcl.amount) 'PendingAmount', 'UPI' As 'PaymentMode', pcl.rrn 'RRNNo', pcl.txn_id 'txnid', pcl.created_on, pcl.status
				FROM  payment_callback_log as pcl 
				JOIN tenant as t on t.tenantid = pcl.tenant_id
				JOIN flatdetails as fd on fd.flatdetailsid = pcl.flat_detail_id
				JOIN code c on c.codeid = fd.wing
				JOIN transaction tr on tr.flatdetailsid = fd.flatdetailsid 
				JOIN users us ON us.userid = tr.societyuserid
				WHERE pcl.tenant_id= ${tenantId} and DATE(pcl.created_on) >= '2022-06-01' and DATE(pcl.created_on) <= '2022-06-30' and pcl.status='SUCCESS'
				GROUP by pcl.tenant_id , us.userId
				order by pcl.created_on  desc`,
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

async function sendTemplate(society) {
	//todo: whatsapp api call using axios to send parameter with template id
	console.log('Method Called', society);
	society.forEach((whatsapp) => {
		whatsapp.msgs.forEach((msg) => {
			console.log(msg);
			let axiosConfig = {
				headers: {
					'Content-Type': 'application/json',
						'apikey' : 'a089b0e1-a1f5-11ec-a7c7-9606c7e32d76'
				}
			  };
			try{
				axios.post('https://api.pinbot.ai/v1/wamessage/send', msg, axiosConfig)
				.then((res) => {
					//console.log("RESPONSE RECEIVED: ", res);
				})
				.catch((err) => {
					console.log("AXIOS ERROR: ", err);
				})
			}catch (error) {
				console.error(error)
			}
		})
	})
}
