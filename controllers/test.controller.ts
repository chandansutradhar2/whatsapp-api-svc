var mysql = require("mysql");
const sqlConfig = require("../sqlconfig");

var con = mysql.createConnection({
	host: sqlConfig.host,
	user: sqlConfig.username,
	password: sqlConfig.password,
	database: sqlConfig.dbName,
});


exports.sendNotification = (req , res) => {

    con.connect(function (err) {
        con.query(`SELECT t.tenantid,t.name 'societyName',t.address 'Society Address', u.firstName 'authorizerName',u.msisdn 'mobileNumber'
        from tenant as t
        JOIN usertenantassociation uta on t.tenantid  =  uta.tenantid
        JOIN users u on uta.userid = u.userId
        WHERE (uta.usertype =12 and uta.status = 1 and u.status =1 and t.tenantid = '1511')
        GROUP by t.tenantid, uta.userId`, 
        async function (err, results, fields) {
            func1();
            func2();
            res.send("done");
        });
    });
}

async function func1() {
    con.connect( function (errr) {
        return new Promise((resolve, reject) => {
            con.query(
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
                        societytenantid = '1511' AND type = 150 and DATE(tr.raised_date) >= '2022-05-01' and DATE(tr.raised_date) <= '2022-05-31'
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
                        tr.societytenantid = '1511' and DATE(tr.raised_date) >= '2022-05-01' and DATE(tr.raised_date) <= '2022-05-31'
                        ) vw;
                        `,
                (err, results, fields) => {
                    if (err) reject(err);
                    resolve(results);
                },
            );
        });
    })
}


async function func2() {
    con.connect(function (err) {
        return new Promise((resolve, reject) => {
            try {
                con.query(
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
                    WHERE pgr.txn_status='TS' AND tn.tenantid='1511'
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
    });
}