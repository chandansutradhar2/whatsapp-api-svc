const axios = require("axios").default;
var mysql = require("mysql");
var XLSX = require("xlsx");
const xl = require("excel4node");
const PDFDocument = require("pdfkit-table");
const fs = require("fs");
const { v4: uuidv4 } = require('uuid');
var Client = require('ftp');
var nodemailer = require('nodemailer');
let transporter = nodemailer.createTransport({
    host: 'blacck-oops-smtp.stroeq.com',
    port: 587,
    secure: false,
    auth: {
        user: 'smtpprov-uaabagegj',
        pass: 'Noida@131'
    },
	tls: {rejectUnauthorized: false}
});
const logger = require('./config/winston');

var SSH2Promise = require('ssh2-promise');
var sshconfig = {
	host:"103.127.31.152",
	port:"2222",
	username: "devteam_karan",
	password: "K@ran#131",
}
var ssh = new SSH2Promise(sshconfig);
var sftp = ssh.sftp()
const sqlConfig = require("./sqlconfig");
const { resolve } = require("path");
var pool = mysql.createPool({
	host: sqlConfig.host,
	user: sqlConfig.username,
	password: sqlConfig.password,
	database: sqlConfig.dbName,
});

const express = require("express");
const { loggers } = require("winston");
const app = express();
app.use(express.json());
//const apiRoutes = require("./routes/api.route");

app.use((req, res, next) => {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Methods", "GET,POST,HEAD,OPTIONS,PUT,PATCH");
	res.header(
		"Access-Control-Allow-Headers",
		"Origin,X-Requested-With,Content-Type,Accept,token",
	);
	next();
});


app.post("/api", (req, res) => {
	let tenantIds = req.body.data;
	var isMaintenanceRaise = req.body.isMaintenanceRaise;
	let societies = [];
	let authorizers = [];
	let reconResults = [];
	let excelResults = [];
	//1: query db for authorizer
	pool.query(
		`SELECT t.tenantid,t.name 'societyName',td.city  'City',t.address 'Society Address', u.firstName 'authorizerName',u.msisdn 'mobileNumber',u.emailAddress
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
				let tmp = await fetchReconData(id,isMaintenanceRaise);
				societies.push({ tenantid: id, authorizerData: [], fileName: '', excelfileName: '', reconData: tmp[0], excelData: [] ,msgs:[]});
			}
			societies.forEach((society, idx) => {
				authorizers.forEach(auth => {
					auth.tenantid == society.tenantid ? societies[idx].authorizerData.push(auth) : null;
				})
			})
			let index = 0;
			for(const tid of tenantIds){
				let excelTmp = await fetchExcelData(tid, isMaintenanceRaise);
				excelTmp.forEach(ele=>{
					societies[index].excelData.push(ele);
				})
				index++;
			}
			for(const soc of societies){
				let fileName = await createPdf(soc, isMaintenanceRaise);
				soc.fileName = fileName;
				let excName = await createTableDemo(soc, isMaintenanceRaise);
				soc.excelfileName = excName;
			}
			let whatsappdata = [];
			// current timestamp in milliseconds
			let ts = Date.now();

			let date_ob = new Date(ts);
			var day = ("0" + date_ob.getDate()).slice(-2);
			var month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
			let year = date_ob.getFullYear();

			societies.forEach((society, idx) => {
				society.authorizerData.forEach(authorizer => {
					societies[idx].msgs.push({
						"tenantId": society.tenantid,
						"from": '918920724833',
						"to": `91${authorizer.mobileNumber}`,
						//"to":"919920346114",
						"type": 'template',
						"message": {
							//"templateid":"12556", // Template id with pdf
							"templateid": `${req.body.templateid}`, // Template id without pdf
							"url":"https://recon.timepayonline.com/recon/"+ society.fileName,
							"filename": society.fileName,
							"placeholders": [authorizer.societyName, 
								day+ "-"+ month + "-" + year, 
								society.reconData.RaisedCount.toLocaleString('en-US'),
								society.reconData.RaisedAmount.toLocaleString('en-US'),
								society.reconData.OnlinePaymentCount.toLocaleString('en-US'),
								society.reconData.OnlinePaymentAmount.toLocaleString('en-US'),
								society.reconData.OfflinePaymentCount.toLocaleString('en-US'),
								society.reconData.OfflinePaymentAmount.toLocaleString('en-US'),
								society.reconData.PendingCount.toLocaleString('en-US'),
								society.reconData.PendingAmount.toLocaleString('en-US')]
						}
					})
					//console.log(whatsappdata);
				});
			})
			//console.log(JSON.stringify(societies[0].msgs));
			//await sendTemplate(societies);
			await sendMail(societies);
			
			// logger.error({
			// 	message: 'Society Generated Data  ', societies ,
			// 	level: 'info',
			// 	timepstamp: new Date()
			// });
			//logger.error(`${req.method} - "Error Found"  - ${req.originalUrl} - ${req.ip}`);
			//await sendLogFileToServer();
			res.send("done");
		},
	);
})

function addCommas(x) {
	if (isNaN(x)) {
		return '-';
	}
	x = (x + '').split('.');
	return x[0].replace(/(\d{1,3})(?=(?:\d{3})+(?!\d))/g,'$1,')
		   + (x.length > 1 ? ('.' + x[1]) : '');
}
async function sendMail(societies){

	return new Promise((resolve, reject) => {
		societies.forEach((whatsapp) => {
			whatsapp.authorizerData.forEach(authorizer => {
				//console.log(authorizer);
				if(authorizer.emailAddress != ''){
					// send Email
					// current timestamp in milliseconds
					let ts = Date.now();

					let date_ob = new Date(ts);
					var day = ("0" + date_ob.getDate()).slice(-2);
					var month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
					let year = date_ob.getFullYear();

					let mailOptions = {
						from: '"Timepay" <maintenance@timepayonline.com>',
						//to: authorizer.emailAddress,
						to: "karan.saluja@npstx.com",
						subject: 'Payment Summary for '+ day+ "-"+ month + "-" + year,
						html: "<b>Payment Summary</b> <br/> Dear <b>'"+authorizer.societyName+"'</b> <br/> Recon Report : <b>'"+day+ "-"+ month + "-" + year+"'</b> <br><br>",
						attachments: [
							{
								filename: whatsapp.excelfileName+'.xlsx',
								path: './reconfiles/'+ whatsapp.excelfileName+ '.xlsx',
							}
						]
					};
					transporter.sendMail(mailOptions, (error, info) => {
						if (error) {
							return console.log(error);
						}
						//console.log(info);
						console.log('Message %s sent: %s', info.messageId, info.response);
					});
				}
			});
		});
		resolve(true);
	})
}

async function createPdf(society, isMaintenanceRaise) {
	console.log(isMaintenanceRaise);
	return new Promise((resolve, reject) => {
		
		try {

			if(isMaintenanceRaise === 'Yes'){

				const headingColumnNames = [
					{ label: "Flat No", property: 'flatNo' },
					{ label: "Customer Name", property: 'custName'},
					// { label: "Contact No", property: 'contactNo', width: 60, renderer: null },
					{ label: "Raised Amount", property: 'raisedamt' },
					{ label: "Received Amount", property: 'receivedamt' },
					{ label: "Pending Amount", property: 'pendingamt'},
					{ label: "Payment Method", property: 'paymentmethod'},
					{ label: "RRN No", property: 'rrnNo'},
					{ label: "TXN ID", property: 'txnid'},
					{ label: "Created On", property: 'createdon'},
				];
		
				const tableRows = [];
		
				society.excelData.forEach((emptable, idx) => {
					if(emptable.RaisedAmount == null){
						emptable.RaisedAmount = 0;
					}
					if(emptable.ReceivedAmount == null){
						emptable.ReceivedAmount = 0;
					}
					if(emptable.PendingAmount == null){
						emptable.PendingAmount = 0;
					} 
					let created_on;
					if(emptable.created_on == null){
						created_on = '';
					}else{
						created_on = emptable.created_on.toISOString().replace(/T/, ' ').replace(/\..+/, '').toString()
					}
					//emptable.created_on.getDate() + '/' + (emptable.created_on.getMonth()+1) + '/' + emptable.created_on.getFullYear()
					let newTblRows = [emptable.FlatNo, emptable.CustomerName, emptable.RaisedAmount.toString(), emptable.ReceivedAmount.toString(), emptable.PendingAmount.toString() , "UPI", emptable.RRNNo, emptable.txnid, created_on];
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
					title: "Payment Summary",
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
				logger.error({
					message: 'File Generated : '+ `${filName}.pdf` ,
					level: 'info'
				});
				resolve(`${filName}.pdf`);

			}else{

				const headingColumnNames = [
					{ label: "Created On", property: 'createdon'},
					{ label: "Status", property: 'status'},
					{ label: "RRN No", property: 'rrnNo'},
					{ label: "TXN ID", property: 'txnid'},
					{ label: "Merchant VPA", property: 'merchantvpa' },
					{ label: "Received Amount", property: 'receivedamt'},
					{ label: "Payment Method", property: 'paymentmethod'},
					
				];
		
				const tableRows = [];
				society.excelData.forEach((emptable, idx) => {
					if(emptable.ReceivedAmount == null){
						emptable.ReceivedAmount = 0;
					}
					 
					let created_on;
					if(emptable.created_on == null){
						created_on = '';
					}else{
						created_on = emptable.created_on.toISOString().replace(/T/, ' ').replace(/\..+/, '').toString()
					}
					//emptable.created_on.getDate() + '/' + (emptable.created_on.getMonth()+1) + '/' + emptable.created_on.getFullYear()
					let newTblRows = [created_on,emptable.status, emptable.RRNNo, emptable.txnid,emptable.MerchantVPA, emptable.ReceivedAmount.toString(), emptable.PaymentMode];
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
					title: "Payment Summary",
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
				logger.error({
					message: 'File Generated : '+ `${filName}.pdf` ,
					level: 'info'
				});
				resolve(`${filName}.pdf`);

			}
		} catch (error) {
			logger.error({
				message: 'Log Printed from Create PDF Module : '+ error,
				level: 'info'
			});
			reject(error)
		}
	})
}

async function sendLogFileToServer(){
	return new Promise((resolve, reject) => {
		//Promise
		ssh.connect().then(() => {
		let logFileName = uuidv4();
		sftp.fastPut(`./logs/error.log`, `/home/devteam_karan/recon/logs/error.log`).then(()=>{
			//console.log("Log Saved Successfully", logFileName);
		}).catch((err)=>{
			//console.log(err);
		}).finally(()=>{
			ssh.close();
		})
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
				fileNames.push(filename)
				
				
				//onFileContent(filename, content);
				});
			});
		});
		fileNames.length > 0 ?resolve(fileNames): reject("Couldnt ready any file")
	})
}

async function createTableDemo(societies, isMaintenanceRaise) {

	return new Promise((resolve, reject) => {
		try {

			if(isMaintenanceRaise === 'Yes'){

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
					let startCol = 1;
					for (const prop in table) {
						if (table[prop] === null || table[prop] === undefined) {
							ws.cell(startRow2, startCol).toString();
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
				logger.error({
					message: 'Excel File Generated : '+ `${fileName}.xlsx` ,
					level: 'info'
				});
				resolve(fileName);

			}else{

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
					"Created On",
					"Status",
					"RRN No",
					"TXN ID",
					"Merchant VPA",
					"Received Amount",
					"Payment Method",
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
					let startCol = 1;
					for (const prop in table) {
						if (table[prop] === null || table[prop] === undefined) {
							ws.cell(startRow2, startCol).toString();
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
				logger.error({
					message: 'Excel File Generated : '+ `${fileName}.xlsx` ,
					level: 'info'
				});
				resolve(fileName);

			}
		} catch (error) {
			logger.error({
				message: 'Log Printed from Create Table Module : ', error,
				level: 'info'
			});
			reject(error)
		}
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

async function fetchReconData(tenantId, isMaintenanceRaise) {
	return new Promise((resolve, reject) => {
		let query = '';
		if(isMaintenanceRaise === 'Yes'){
			query = `SELECT SUM(totalraisedCount) 'RaisedCount',SUM(totalraisedAmount) 'RaisedAmount',SUM(pendingCount) 'PendingCount',
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
						) vw;`;
		}else{
			query = `SELECT '0' as RaisedCount, '0' AS RaisedAmount, '0' AS PendingCount, 
					'0' AS PendingAmount, Count(id) 'OnlinePaymentCount', SUM(amount) 'OnlinePaymentAmount',
					'0' AS 'OfflinePaymentCount',  '0' AS 'OfflinePaymentAmount' FROM  
					payment_callback_log  where tenant_id= ${tenantId}`;
		}
		try {
			pool.query(
				query,
				(err, results, fields) => {
					
					if (err) logger.error({ message: 'Log Printed from Fetch Recon Data Query : ', err, level: 'info'}); 

					resolve(results);
					logger.error({
						message: 'Query Worked Successfully: ', results ,
						level: 'info'
					});
				},
			);	
		} catch (error) {
			logger.error({
				message: 'Log Printed from Fetch Recon Data Catch : ', error,
				level: 'info'
			});
			reject(error)
		}
	});
}

async function fetchExcelData(tenantId, isMaintenanceRaise) {
	return new Promise((resolve, reject) => {
		try {
			let query = '';
			if(isMaintenanceRaise === 'Yes'){
				query = `SELECT 
					concat(cd.code, '-', fl.flatno) 'FlatNo', us.firstName 'CustomerName',tr.amount 'RaisedAmount', tb.paidamount 'ReceivedAmount', 
					ROUND(tr.amount - tb.paidamount) 'PendingAmount', tr.payment_method 'PaymentMode', tr.rrn 'RRNNo',  tr.txn_id 'txnid', tr.raised_date 'created_on',
					CASE
					WHEN tr.status  = 12 THEN "PARTIAL PAYMENT"
					WHEN tr.status = 2 THEN "SUCCESS"
					ELSE "Pending"
				END as status
				FROM 
					transaction tr
						JOIN
					flatdetails fl ON fl.flatdetailsid = tr.flatdetailsid
						JOIN
					users us ON us.userid = tr.societyuserid 
					left join (select sum(paidamount) paidamount, txn_id from transactiondetailsbreakup group by txn_id) tb on tb.txn_id=tr.txn_id 
					join code cd on cd.codeid = fl.wing where tr.societytenantid = ${tenantId}
					order by tr.raised_date desc`;
			}else{
				query = `SELECT created_on,status,rrn 'RRNNo', txn_id 'txnid',merchant_vpa 'MerchantVPA' , amount 'ReceivedAmount', 'UPI' As 'PaymentMode' FROM  payment_callback_log  where tenant_id= ${tenantId}`;
				
			}
			pool.query(
				query,
					(err, results, fields) => {
						if (err) logger.error({ message: 'Log Printed from Fetch Excel Data module : ', err,level: 'info'}); 
						
						resolve(results);
					},
			);
		} catch (error) {
			
			logger.error({
				message: 'Log Printed from Fetch Excel Data Catch : ', error,
				level: 'info'
			}); 
		}
	});
}

async function sendExcel(societies) {
	//todo: whatsapp api call using axios to send excel file as content type
	return new Promise((resolve, reject) => {
		societies.forEach((whatsapp) => {
			whatsapp.authorizerData.forEach(authorizer => {
				if(authorizer.emailAddress != ''){
					// send Email
				}
			});
		});
		resolve(true);
	})
}

async function sendTemplate(society) {
	//todo: whatsapp api call using axios to send parameter with template id
	setTimeout(() => {
		society.forEach((whatsapp) => {
			whatsapp.msgs.forEach((msg) => {

				let axiosConfig = {
					headers: {
						'Content-Type': 'application/json',
							'apikey' : 'a089b0e1-a1f5-11ec-a7c7-9606c7e32d76'
					}
				  };
				try{
					setTimeout(() => {
						let optionData = {
							"from": "+918920724833",
							"contact": `${msg.to}`
						}
						axios.post('https://api.pinbot.ai/v1/wamessage/optin',optionData, axiosConfig).then((resp) => {
							logger.error({
								message: 'OPTIN RESPONSE RECEIVED : ',
								level: 'info',
								res: resp.data
							});
							if(resp.data.code === '200'){
								axios.post('https://api.pinbot.ai/v1/wamessage/send', msg, axiosConfig)
								.then((res) => {
									//.console.log("RESPONSE RECEIVED: ", res);
									logger.error({
										message: 'WHATSAPP RESPONSE RECEIVED : ',
										level: 'info',
										res: res.data
									});
								})
								.catch((err) => {
									logger.error({
										message: 'AXIOS ERROR : '+ err ,
										level: 'info'
									});
								})
							}
						});
					}, 5000);
				}catch (error) {
					console.error(error)
					logger.error({
						message: 'WHATSAPP CATCH ERROR : '+ error ,
						level: 'info'
					});
				}
			})
		})
	}, 420000);
	//420000
}

//app.use("/api", apiRoutes);

app.listen(4000, () => {
	console.log("server started and listening on port 4000");
});
