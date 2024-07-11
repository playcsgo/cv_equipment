# README

![架構](https://github.com/playcsgo/cv_equipment/blob/main/wireframe/RabbitMQ.png)

- 使用pm2 進行多緒執行. 
- 傳統的RESTful架構搭配RabbitMQ進行queeue以及worker的非同步分工
- 由Redis進行不同的執行緒溝通
- 體驗網路商城充值以及升級裝備


1. Fork
2. git clone

## 初始化
### Initialize
```
npm install

## 使用pm2執行
pm2 start ecosystem.config.js 
```

### 設定資料庫
you need a mongoDB URL in .env

```
create a User Table as model
```
