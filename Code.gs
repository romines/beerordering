 /*
  * This apps script generates an html order form appropriate for placing wholesale orders,
  * records these orders in Google spreadsheets, and sends email notifications to begin the
  * fulfillment process.
  * 
  * Data is recorded to two spreadsheets, Order Data and Order History. Order Data is intended
  * to be an unformatted view of orders, with each order occupying a single row in one large
  * table. Order History provides a more visual representation of each order, one per sheet.
  * 
  */

  // Global variable for accessing spreadsheet of customers (and URLs for Order History, Order
  // Data spreadsheets).

var DISTRIBUTORS = SpreadsheetApp
     .openById('1i7Qjy5rQIKtOg1DLaihqv0s0yq4uk0-EWhDntCIBnyY')
     .getSheets()[0];
     

function doGet(e) {
  
  // Build HtmlService Template object, t.
  
  var t = HtmlService.createTemplateFromFile('index');
  
  // Bind array of current specialty beer data to t as .specBeers property. Available
  // specialty beers change frequently, and this spreadsheet needs to be maintained accordingly.
  
  t.specBeers = SpreadsheetApp
     .openById('1_5JfZgCdY8fmfcXU1cxIOIeTbkYAp5aeM7bzEnhmAY4')
     .getActiveSheet()
     .getDataRange()
     .getValues();
  t.distributorID = e.parameter.d;
  t.debugMode = e.parameter.debug;
  
  return t.evaluate().setTitle('Packaged Beer Order Form');
  
}

   
function Beer(name, sixthBBL, halfBBL, cases, specialty) {
 /*
  * Constructor for Beer object.
  * 
  */
  
  this.name = name;
  this.sixthBBL = sixthBBL;
  this.halfBBL = halfBBL;
  this.cases = cases;
  this.specialty = specialty || false;
  
  }
  

function processForm(form) {

 /* 
  * Triggered on form submit with success handler to confirm success in UI. Records raw order 
  * data to Order Data spreadsheet.
  *
  * Argument: form - form object from submission of index.html form.
  *
  * Returns: order object for further (asynchronous) processing
  * 
  */
  
  // Use distributor ID to retrieve Order Data and Order History spreadsheets
  
  var sheets = setSheets(form.distributor);
  
  var orderDataSheet = SpreadsheetApp.openByUrl(sheets.orderData).getSheets()[0];
   
  var orderID = mkOrderID(orderDataSheet);
  
  // build order object

  var submitted = new Date();
  
  var order = {
  
  // An order consists of beer objects constructed from form data, and meta information about the 
  // order in a 'meta' object.
  
  meta : {
    orderID : orderID,
    submissionDate : submitted.toString(),
    distID : form.distributor,
    distributor : sheets.distName,
    orderData : sheets.orderData,
    orderHist : sheets.orderHistory,
    dateRequested : form.date,
    distEmail : form.email,
    comments : form.comments,
    formMode : form.formMode,
    notifEmail : form.debugEmail,
    ccChris : form.ccChris
    },
    
    
  pale : new Beer('Snake River Pale Ale', form.paleSixth, form.paleHalf, form.paleCase),
  lager : new Beer('Lager', form.lagerSixth, form.lagerHalf, form.lagerCase),
  zonker : new Beer('Zonker Stout', form.zonkerSixth, form.zonkerHalf, form.zonkerCase),
  monarch : new Beer('Monarch Pilsner', form.monarchSixth, form.monarchHalf, form.monarchCase),
  pakos : new Beer('Pako\'s IPA', form.pakosSixth, form.pakosHalf, form.pakosCase),
  special1 : new Beer(form.specBeer1, form.specBeer1Sixth, form.specBeer1Half, 0, true),
  special2 : new Beer(form.specBeer2, form.specBeer2Sixth, form.specBeer2Half, 0, true),
  special3 : new Beer(form.specBeer3, form.specBeer3Sixth, form.specBeer3Half, 0, true),
  special4 : new Beer(form.specBeer4, form.specBeer4Sixth, form.specBeer4Half, 0, true),
  special5 : new Beer(form.specBeer5, form.specBeer5Sixth, form.specBeer5Half, 0, true),
  special6 : new Beer(form.specBeer6, form.specBeer6Sixth, form.specBeer6Half, 0, true),
  special7 : new Beer(form.specBeer7, form.specBeer7Sixth, form.specBeer7Half, 0, true)
  
  
  };
  
  // Write order data to Order Data spreadsheet

  writeOrderData(order);
  
  return order;
  
}



function writeOrderData (order){
 /*
  * Builds array of order data and appends as single line to Order Data sheet
  *
  * This could probably be handled by building an array with the getBeers function and then 
  * writing individual beer properties to another array with a loop...but this works too.
  *
  */
  
  var orderDataSheet = SpreadsheetApp.openByUrl(order.meta.orderData).getSheets()[0];
  
  var orderLine = [order.meta.orderID, order.meta.submissionDate, order.meta.dateRequested, order.meta.comments,
    order.pale.sixthBBL, order.pale.halfBBL, order.pale.cases,
    order.lager.sixthBBL, order.lager.halfBBL, order.lager.cases,
    order.zonker.sixthBBL, order.zonker.halfBBL, order.zonker.cases,
    order.monarch.sixthBBL, order.monarch.halfBBL, order.monarch.cases,
    order.pakos.sixthBBL, order.pakos.halfBBL, order.pakos.cases,
    order.special1.name, order.special1.sixthBBL, order.special1.halfBBL,
    order.special2.name, order.special2.sixthBBL, order.special2.halfBBL,
    order.special3.name, order.special3.sixthBBL, order.special3.halfBBL,
    order.special4.name, order.special4.sixthBBL, order.special4.halfBBL,
    order.special5.name, order.special5.sixthBBL, order.special5.halfBBL,
    order.special6.name, order.special6.sixthBBL, order.special6.halfBBL,
    order.special7.name, order.special7.sixthBBL, order.special7.halfBBL

    ];
    
  orderDataSheet.appendRow(orderLine);
  
}


function asyncProcessing(order) {
 /* 
  * Writes Order History, sends email notifications, and decrements inventory (of inventory tracked
  * beers.
  * 
  *
  */
  
  sendEmails(order);
  
  decInventory(order);
  
  var orderHistSS = SpreadsheetApp.openByUrl(order.meta.orderHist);
  
  // Create new sheet in Order History sheet, named for today's date
  
  var newSheetName = ordrHistSheetName(order.meta.orderID); 
  
  var template = orderHistSS.getSheetByName('Blank Sheet');
  var newSheet = template.copyTo(orderHistSS).setName(newSheetName);
  
  orderHistSS.setActiveSheet(newSheet);
  orderHistSS.moveActiveSheet(0);
  
  // Order Meta Data
  //
  //
  // Create array of Order ID, Submission Date and Date Requested and write to new Order History sheet
  
  
  var metaRay = [[order.meta.orderID], [order.meta.submissionDate]]; //, [order.meta.dateRequested]];
  
  newSheet.getRange(4, 2, 2, 1).setValues(metaRay);
  
  // Standard Beers
  //
  //
  // Create array of standard beer objects from incoming order
  
  var stdBeerRay = getStandards(order);
  
  // Create empty array that will be written to Order History spreadsheet range
  
  var stdBeerWriteRay = [];
  
  // Loop through incoming beers, append to array
  
  for (var i = 0; i < stdBeerRay.length; i++) {
    
    var theThree = [stdBeerRay[i].cases, stdBeerRay[i].halfBBL, stdBeerRay[i].sixthBBL ];
    
    stdBeerWriteRay.push(theThree);
    
  }
  
  // Get 5x3 range and write standard beers to it
  
  newSheet.getRange(9, 3, stdBeerWriteRay.length, 3).setValues(stdBeerWriteRay);
  
  // Specialty Beers
  //
  //
  // Similar to standard beers, create ordered array of incoming beers, create and write to
  // array of decomposed beer objects and write to spreadsheet
  
  var specBeerRay = getSpecials(order); 
  
  var specBeerWriteRay = [];
  
  for (var j = 0; j < specBeerRay.length; j++) {
    
    if (! noneOrdered(specBeerRay[j]) ) {
    
      var theTwo = [specBeerRay[j].name, '', specBeerRay[j].halfBBL, specBeerRay[j].sixthBBL ];
        
      specBeerWriteRay.push(theTwo);
        
      }
    }
  
  
  newSheet.getRange(14, 2, specBeerWriteRay.length, 4).setValues(specBeerWriteRay);
  
}


function sendEmails (order) {
  
 /* 
  * Uses hardcoded email copy and data from order to send an email notification to the employee
  * that must fulfill order, an an order confirmation to the customer using GmailApp.sendEmail()
  *
  */
  
  // Declare some useful varaiables from order
  
  
  var sendConfirmation = false;
  
  if (order.meta.distEmail) {
  
    var distEmail = order.meta.distEmail;
    
    sendConfirmation = true;
    
  }
  
  var distributor = order.meta.distributor;
  
  var orderHistoryURL = order.meta.orderHist;
  
  // Build pretty table of ordered beers
  
  var orderTable = buildTable(order);
  
  
  // Confirmation email
  
  var confEmailHtml = '<h2>Thank you for your order.</h2>' + orderTable + '<br>To review full order details, please visit your <a href="' + orderHistoryURL + '">Order History page</a>.';
  
  // Just in case the email body parameter serves as plaintext fallback?
  
  var confTextOnly = 'Thank you for your order. To review full order details, please visit your Order History page: ' + orderHistoryURL;
  
  if (sendConfirmation) {
    GmailApp.sendEmail(distEmail, 'Snake River Brewing packaged beer order', confTextOnly, {
      htmlBody: confEmailHtml }
    ); 
  }
  
  // Notification to whomever is doing fulfillment
  
  var cory = order.meta.notifEmail || 'cory@genericbrewingco.com';
  
  var salutation = distributor + ' has submitted a new order';
  
  var notifEmailHtml = '<h2>' + salutation + '.</h2><br>' + orderTable + '<br><b>Order comments/special instructions:</b> ' + order.meta.comments + '<br><br>To view full order details for this or past orders, visit the ' + distributor + ' <a href="' + orderHistoryURL + '">Order History page</a>.';
  
  // Plaintext version
  
  var notifTextOnly = distributor + ' has submitted an order. To view full order details, please visit their Order History page: ' + orderHistoryURL;
    
  // Email options object
  
  var emailOptions = {
    htmlBody: notifEmailHtml
    };
  
  
  if ( order.meta.formMode || order.meta.ccChris ) {
    emailOptions.cc = 'chris@genericbrewingco.com';
  } 
  
  if (! order.meta.formMode ) {
    salutation = 'Testing: ' + salutation;
  }
  
  // Send notification email
  
  GmailApp.sendEmail(cory, salutation, notifTextOnly, emailOptions);
  
}


function decInventory(order) {
  
  var specBeersOrdered = getSpecials(order);
  
  var specBeerRange = SpreadsheetApp
     .openById('1_5JfZgCdY8fmfcXU1cxIOIeTbkYAp5aeM7bzEnhmAY4')
     .getActiveSheet()
     .getDataRange();
     
  var specBeerInventory = specBeerRange.getValues();
  
  var localInventory = specBeerInventory.slice(0);
  
  for (var i=1; i < localInventory.length; i++) {
    
    for (var j=0; j < specBeersOrdered.length; j++) {
    
      if (specBeersOrdered[j].name == localInventory[i][0]) {
//        localInventory[i][1] -= specBeersOrdered[j].halfBBL;
//        localInventory[i][2] -= specBeersOrdered[j].sixthBBL;

        var diffBeers = subtract(localInventory[i], specBeersOrdered[j])
        
        localInventory[i][1] = diffBeers.sixth;
        localInventory[i][2] = diffBeers.half;
      }
    }
  }
  
  specBeerRange.setValues(localInventory);
  
  
}


function subtract(availableBeer, purchasedBeer) {
  
  var availSixth = parseInt(availableBeer[1]);
  var availHalf = parseInt(availableBeer[2]);
  
  var orderedSixth = parseInt(purchasedBeer.sixthBBL) || 0;
  var orderedHalf = parseInt(purchasedBeer.halfBBL) || 0;
  
  var difference = {
    
    sixth : availSixth - orderedSixth,
    half : availHalf - orderedHalf
  
  }
  
  return difference;
  
}


function buildTable(order) {
 /* 
  * Builds html table for use in email. Even and odd rows get different backgrounds for readability.
  * 
  */
  
  var tableString = '<table style="border: 1px solid black; border-collapse: collapse;"><tr><th style="border: 1px solid black;">Beer</th><th style="border: 1px solid black;">Cases</th><th style="border: 1px solid black;">1/2 Barrel Kegs</th><th style="border: 1px solid black;">1/6 Barrel Kegs</th></tr>';
  
  var beers = getBeers(order);

  for (var i=0; i < beers.length; i++) {
    if (i%2 == 0) {
      tableString += beerToTableRow(beers[i], 'even');
    } 
    else { tableString += beerToTableRow(beers[i], 'odd'); }
    
  }
  
  tableString += '</table>';
  
  return tableString;

}


function beerToTableRow(beer, oddOrEven) {
 /* 
  * Wraps beer data in <td> tags inside <tr>, styled according to even or odd
  * 
  */  
  
  var rowData = [
    beer.name,
    beer.cases,
    beer.halfBBL,
    beer.sixthBBL 
  ];
  
  if ( beer.specialty ){
    rowData[1] = '&nbsp;';
  }
  
  var trString = '<tr>';
  
  if ( oddOrEven == 'odd' ){
    trString = '<tr style="background-color: #E6E6E6;">';
  }
  
  for (var i = 0; i < rowData.length; i++) {
    trString += '<td style="border: 1px solid black; text-align: center;">' + rowData[i] + '</td>';
  }
  
  trString += '</tr>';
  
  return trString;
  
}

function setSheets(distID) {
  
 /*
  * Given distributor ID, returns object with URLs for order data, history sheets
  *
  */
  
  var distSheetRange = DISTRIBUTORS.getDataRange();
  
  var values = distSheetRange.getValues();
  
  if (distID) {
    
    // un-obfuscate distributor ID
    
    var row = (distID % 100)/4;
    
    // binds URLs of distributor Order Data and Order History sheets to properties of 
    // distSheets object
    
    var distSheets = {
      orderData: values[row-1][4],
      orderHistory: values[row-1][2],
      distName: values[row-1][1]
    };
  }
    
    return distSheets;
    
}

function mkOrderID(orderDataSheet){
  
 /* 
  * Constructs unique order IDs based on date. Second (and subsequent) orders on a single day are
  * given consecutive IDs
  * This could be useful later.
  *
  */
   
  var lastRow = orderDataSheet.getLastRow();
  var prevID = orderDataSheet.getRange(lastRow, 1).getValue().toString();
  var today = new Date();
  var dateString = today.getFullYear().toString() 
  
  // uses conditional (ternary) operator to pad single digit month and days with '0' for length consistency
  
  dateString += ((today.getMonth() + 1) < 10 ? '0' : '') + (today.getMonth() +1).toString();
  dateString += (today.getDate() < 10 ? '0' : '') + today.getDate().toString();

  var subString = prevID.slice(0,7);
  
  if (dateString == (prevID.slice(0,8))) {
    return (parseInt(prevID) + 1).toString();
    }
  else {
    return dateString + '01';
  }
}

function ordrHistSheetName(orderID) {
 /* 
  * Constructs unique Order History Tab names based on orderID. Second (and subsequent) orders
  * on a single day are given consecutive names ('.02', '.03', etc.)
  * 
  *
  */
  
  
  var month = orderID.slice(4,6);
  var day = orderID. slice(6,8);
  
  var prettyName = month + '/' + day
  
  var lastTwo = orderID.slice(-2);
  
  if (lastTwo != '01') {
    prettyName += '.' + lastTwo;
  }
  
  return prettyName;
  
}
 

function getBeers(order) {
  
 /*
  * Argument: order object
  *
  * Returns: ordered list of none-empty beers, standards first
  *
  */
  
  var inBeers = [order.pale, order.lager, order.zonker, order.pakos, order.monarch, order.special1, order.special2, 
    order.special3, order.special4, order.special5, order.special6, order.special7];
  
  var beers = [];
  
  for (var i = 0; i < inBeers.length; i++) {
    if (! noneOrdered(inBeers[i])){
      beers.push(inBeers[i]);
    }
  }
  
  return beers;
  
}

function getStandards(order) {

  // Builds ordered array of standard beers
  
  var standards = [order.pale, order.lager, order.zonker, order.pakos, order.monarch];
  
  return standards;
  
}

function getSpecials(order) {

  // Builds ordered array of specialty beers
    
  var specialties = [order.special1, order.special2, order.special3, order.special4, order.special5, order.special6, order.special7];
  
  return specialties;
  
}

function noneOrdered(beer) {
 /*
  * 
  * method that determines if all unit values (halfBBL, sixthBBL, case) are
  * zero or undefined for this beer. 
  * 
  * Returns: boolean
  */
  
  var empty = false;
  
  if ( isEmpty(beer.sixthBBL) && isEmpty(beer.halfBBL) && isEmpty(beer.cases) ) {
    
    empty = true;
    
  }
  
  return empty;
  
}

function isEmpty(unit) {
 /*
  * Function to test single unit (halfBBL, sixthBBL or cases) within Beer 
  * object for 'emptiness.' Returns true if given unit is 0, undefined,
  * null, etc.
  */

  empty = false;
  
  if (! unit) { 
    empty = true; }
  else if ( unit == '0' ) {
    empty = true;
  } 
  
  return empty;
  
}


function gBug(subj, body) {
  
  body = body || subj
  
  GmailApp.sendEmail("adam.romines@gmail.com", subj, body);

}


// ##############################################################################
