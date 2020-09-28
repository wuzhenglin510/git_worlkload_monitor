##### 工作量统计平台
##### 包含3个项目:
- 后端
- 前端
- 定时统计脚本

##### 该项目属于统计脚本

##### 功能: 根据git记录统计每个人每天所有分支的代码提交行数, 根据一定的算法计算出新增/删除行数
##### 如何做到准确的统计行数:
- 不统计每行少于5个字符的新增行
- 不统计提交的新增注释代码
- 不统计因为代码格式化导致行数的变化
- 不统计因为备份文件/拷贝文件/97%属于拷贝内容的文件，导致的行数剧增的问题 (主要做法:发现有新增文件时，对当前commit的上一次commit的关键文件，比如后缀js,java,vue，
进行全项目文件以及新增文进行词向量构建，通过余弦公式计算余弦相似度，相似度大于97%的文件不参与统计)

```bash
成功切换到 master
成功切换到 pre
2019-09-20 [{"engineer":"HMSJ29\\Administrator","branches":["develop","leo"],"date":"2019-09-20","add":0,"delete":0},{"engineer":"demo1","branches":["develop","leo","pre"],"date":"2019-09-20","add":0,"delete":0},{"engineer":"demo6","branches":["develop","leo"],"date":"2019-09-20","add":2978,"delete":487},{"engineer":"demo5","branches":["develop","leo","pre"],"date":"2019-09-20","add":0,"delete":0},{"engineer":"demo3","branches":["develop","leo","pre"],"date":"2019-09-20","add":0,"delete":0},{"engineer":"demo2","branches":["develop","leo","pre"],"date":"2019-09-20","add":0,"delete":0},{"engineer":"demo4","branches":["master"],"date":"2019-09-20","add":0,"delete":0}]
成功切换到 develop
成功切换到 e45043e~
成功切换到 e45043e
[发现疑似复制文件] 相似程度:0.9702164411156877 file1[e45043e]:/Users/wzl/repository/demo1/web-admin/src/components/selectShop_BACKUP_24020.vue @ file2[e45043e~]:/Users/wzl/repository/demo1/web-admin/src/components/selectShop.vue
[发现疑似复制文件] 相似程度:0.9941002434954169 file1[e450

43e]:/Users/wzl/repository/demo1/web-admin/src/components/selectShop_BASE_24020.vue @ file2[e45043e~]:/Users/wzl/repository/demo1/web-admin/src/components/selectShop.vue
[发现疑似复制文件] 相似程度:1 file1[e45043e]:/Users/wzl/repository/demo1/web-admin/src/components/selectShop_LOCAL_24020.vue @ file2[e45043e~]:/Users/wzl/repository/demo1/web-admin/src/components/selectShop.vue
[发现疑似复制文件] 相似程度:0.961203955192789 file1[e45043e]:/Users/wzl/repository/demo1/web-admin/src/components/selectShop_REMOTE_24020.vue @ file2[e45043e~]:/Users/wzl/repository/demo1/web-admin/src/components/selectShop.vue
成功切换到 develop
```
