const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const mime={'.html':'text/html;charset=utf-8','.js':'application/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/manifest+json;charset=utf-8','.webmanifest':'application/manifest+json;charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.webp':'image/webp'};
http.createServer((req,res)=>{
  let fp=path.join(__dirname,decodeURIComponent(req.url.split('?')[0]));
  if(fp.endsWith('/'))fp=path.join(fp,'index.html');
  fs.stat(fp,(e,s)=>{
    if(e){res.writeHead(404);res.end('Not Found');return;}
    if(s.isDirectory())fp=path.join(fp,'index.html');
    fs.readFile(fp,(err,data)=>{
      if(err){res.writeHead(500);res.end('Error');return;}
      const etag='"'+crypto.createHash('md5').update(data).digest('hex').slice(0,16)+'"';
      if(req.headers['if-none-match']===etag){res.writeHead(304);res.end();return;}
      res.writeHead(200,{'Content-Type':mime[path.extname(fp)]||'application/octet-stream','Cache-Control':'no-cache','ETag':etag});
      res.end(data);
    });
  });
}).listen(3000,'127.0.0.1',()=>console.log('Server running at http://127.0.0.1:3000'));
