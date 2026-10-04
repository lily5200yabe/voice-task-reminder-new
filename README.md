# voice-task-reminder

手機優先的純 HTML、CSS、JavaScript 語音待辦提醒 Web App。資料儲存在瀏覽器 localStorage；不使用框架、資料庫、AI、推播或登入。

## 本機預覽

在專案資料夾執行：

```powershell
py -m http.server 8000 --bind 0.0.0.0
```

電腦開啟 `http://localhost:8000`。手機和電腦連上同一個 Wi-Fi 後，手機瀏覽器開啟 `http://電腦的區域網路IP:8000`。若連線失敗，請允許 Windows 防火牆的私人網路連線。

部分瀏覽器只在 HTTPS 或 localhost 提供 Web Speech API；語音辨識在手機上可能需要安全來源，文字輸入與 iPhone 鍵盤聽寫則可直接使用。
