const http = require('http');
const url = "http://localhost:5513/?slc=set&param1=session&param2=folder&param3=D:\\HMJ SI\\Festival HMJ SI\\Website\\sifest-foto\\storage\\sessions\\TEST-MANUAL\\original";
http.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Set folder:', data));
});
