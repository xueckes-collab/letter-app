import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("letterDesktop", {
  getInfo: () => ipcRenderer.invoke("desktop:get-info"),
});
