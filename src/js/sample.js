export function downloadSample() {
  const h = ['Stock name', 'Symbol', 'ISIN', 'Type', 'Quantity', 'Value', 'Exchange', 'Exchange Order Id', 'Execution date and time', 'Order status'];
  const aoa = [[], [], [], [], [], h,
    ['INFOSYS LTD', 'INFY', 'INE009A01021', 'BUY', 10, 15000, 'NSE', '1100000000000001', '05-01-2024 09:20 AM', 'Executed'],
    ['INFOSYS LTD', 'INFY', 'INE009A01021', 'BUY', 5, 7600, 'NSE', '1100000000000002', '12-02-2024 11:05 AM', 'Executed'],
    ['INFOSYS LTD', 'INFY', 'INE009A01021', 'SELL', 8, 12800, 'NSE', '1100000000000003', '20-03-2024 02:30 PM', 'Executed'],
    ['SPICEJET LTD', 500285, 'INE285B01017', 'BUY', 100, 5000, 'BSE', '1100000000000004', '10-01-2024 10:00 AM', 'Executed'],
    ['SPICEJET LTD', 500285, 'INE285B01017', 'SELL', 100, 6500, 'BSE', '1100000000000005', '15-04-2024 03:10 PM', 'Executed'],
    ['TATA CONSULTANCY SERVICES LTD', 'TCS', 'INE467B01029', 'BUY', 3, 11000, 'NSE', '1100000000000006', '02-05-2024 13:45', 'Executed'],
    ['HDFC BANK LTD', 'HDFCBANK', 'INE040A01034', 'SELL', 2, 3200, 'NSE', '1100000000000007', '03-06-2024 10:15 AM', 'Executed'],
    ['ITC LTD', 'ITC', 'INE154A01025', 'BUY', 50, 21000, 'NSE', '1100000000000008', '04-06-2024 09:30 AM', 'Pending']
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Trades');
  XLSX.writeFile(wb, 'sample-trades.xlsx');
}
