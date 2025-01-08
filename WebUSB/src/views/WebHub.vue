<template>
  <div class="webhub">
    <list-devices v-if="$store.state.TpgDevices.length" />
    <no-devices v-else />
    <v-btn block @click="getNewDevice()"> Connect </v-btn>
  </div>
</template>

<script>
import MTPDevice from "../store/modules/mtpDriver"
import { format } from 'date-fns'

const TPG_USB_VENDOR_ID = 7485           // This is the Vendor ID assigned to TPG by the USB Consortium
const TPG_COMMAND_FILE = "command.txt"
const TPG_CONFIG_FILE = "config.txt"
const TPG_AUDIO_FILE = "data.dat"
const TPG_FIRMWARE_FILE = "BOOTIMG.img"
let MTPDevices = []                       // Array of connected MTP Devices - must match the $store

class deviceSettings {
  constructor() {
    this.deviceConnected = false
    this.isConnected = false
    this.audioCopyTimeStarted = null
    this.audioCopyTimeFinished = null
    this.audioCopyBytes = 0
    this.audioCopyTotalBytes = 0
    this.audioCopyProgress = 0
    this.audioUploadedTimeStarted = null
    this.audioUploadTimeFinished = null
    this.audioUploadProgress = 0
    this.audioUploadBytes = 0
    this.config = null
    this.storageObjects = null
    this.commandFile = null
    this.commandText = null
    this.commandBytes = null
  }
}

/* 
 * @Vue     Vue default  class
 * @brief   This is a standard Vue default script
 *          
 */
export default {
  name: "WebHub",

  components: {
    "list-devices": require("@/components/Todo/ListDevices.vue").default,
    "no-devices": require("@/components/Todo/NoDevices.vue").default,
  },

  /* 
   * @Vue     Vue Created Element
   * @brief   When the page is created, register the USB listeners and connect to devices
   *          
  */
  created() {
    // Register Google Chrome WebUSB disconnect listener
    navigator.usb.addEventListener("disconnect", event => {
      console.log("Disconnected", event.device)
      this.disconnect(event.device)
    })

    // Register  Register Google Chrome WebUSB connect listener 
    navigator.usb.addEventListener("connect", event => {
      console.log("Connected", event.device)
      this.OpenDevice(event.device)
    })

    // Connect to USB devices
    this.connectDevices()
  },

  /* 
   * @Vue     Vue methods
   * @brief   These methods are called by the callbacks on this Vue and it's component Vue files.
   *          
  */
  methods: {
    /* 
     * @method  connectDevices
     * @brief   Attempts to open all paired TPG MTP devices
     *          
     */
    async connectDevices () {
      let usbDevices = await navigator.usb.getDevices()
      usbDevices.forEach(usbDevice => {
        console.log("Device already connected:", usbDevice)
        this.OpenDevice(usbDevice)
      })
    },

    /* 
     * @method  getNewDevice
     * @brief   Prompts the user to allow access to a new device
     *          
     */
    async getNewDevice() {
      try {
        let usbDevice = await navigator.usb.requestDevice({ filters: [{ vendorId : TPG_USB_VENDOR_ID }]})
        if (usbDevice !== undefined) {
          console.log("getNewDevice: User Selected ", usbDevice)
          await this.OpenDevice(usbDevice)
        }
      }
      catch (err) {
        console.log("getNewDevice: Error ", err)
      }
    },

    /* 
     * @method  openDevice
     * @brief   Opens a Device session with a TPG MTP Device
     * @parms   usbdevice - The WebUSB device object returned from Chrome Navigator requestDevice or getDevices calls.
     *          
     */
    async OpenDevice(usbdevice) {
      let device = new MTPDevice()        // Create a new MTP Device Object
      device.device = usbdevice           // Set the USB property of the MTP Device class
      let status = false
      //try {
        await device.device.open()        // Open the USB connection
        await this.sleep(50)
        console.log("OpenDevice: Opened.")
        await device.device.selectConfiguration(1)
        console.log("OpenDevice: Set Config.")
        await this.sleep(50)
        await device.device.claimInterface(0)
        await this.sleep(50)
        console.log("OpenDevice: Claimed Interface.")
        await device.getEndpoints()
        await this.sleep(50)
        console.log("OpenDevice: Retrieved Endpoints.")
        status = await device.openSession()
        if (status === true) {
          console.log("OpenDevice: Retrieving storage objects.")
          let storageObjects = await this.getStorageIDS(device)
          if (storageObjects !== null) {
            let fileObjects = null
            for (let i=0;i<storageObjects.length;i++) {
              fileObjects = await this.getFileObjects(device, storageObjects[i].storageID)
            }
            let currentSettings = await this.downloadSettingsFile(device)
            console.log("OpenDevice: Config.txt", currentSettings)
            device.SerialNumber = currentSettings.config.SerialNumber
            MTPDevices.push(device)        // Push this device onto array of devices
            if (this.deviceExist(currentSettings) === false) {
              this.$store.dispatch("addDevice", currentSettings)
            }
            else {
              // Update the device record

            }
          }
        }
      //} catch (err) {
      //  console.log("OpenDevice: Error ", err)
      //}
    },

    /* 
     * @method  deviceExist
     * @brief   Returns TRUE if the device exists in the Vue $store
     *          
     */
    deviceExist(refDevice) {
      let isFound = false
      this.$store.state.TpgDevices.forEach(device => {
        console.log("Comparing:", refDevice, device)
        if (refDevice.config.SerialNumber === device.config.SerialNumber) {
          console.log("Matched")
          isFound = true
        }
      })
      return isFound
    },

    /* 
     * @method  disconnectDevice
     * @brief   The user pressed the Eject button, perform a soft-eject
     *          
     */
    async disconnectDevice(TpgDevice) {
      try {
        let deviceIndex = MTPDevices.findIndex(element => { if (element.SerialNumber === TpgDevice.config.SerialNumber) { return true; }})
        console.log("User ejected", MTPDevices[deviceIndex])
        await MTPDevices[deviceIndex].closeSession()
        MTPDevices.splice(deviceIndex, 1)                                 // Remove from Device Array
        this.$store.dispatch("deleteDevice", TpgDevice.id)
      }
      catch (err) {
        console.log("Error ejecting device.", err)
      }
    },

    /* 
     * @method  disconnect
     * @brief   User unplugged a USB device (callback)
     *          
     */
    async disconnect(usbDevice) {
      try {
        let deviceIndex = MTPDevices.findIndex(element => { if (element.device === usbDevice) { return true; }})
        let serialNumber = MTPDevices[deviceIndex].SerialNumber
        console.log("User disconnected: ", MTPDevices[deviceIndex])
        MTPDevices.splice(deviceIndex, 1)                                 // Remove from Device Array
        this.$store.dispatch("deleteDeviceBySerialNumber", serialNumber)  // Remove from store
        console.log("Device session closed successfully.", usbDevice)
      } catch (err) {
          console.log("Error disconnecting." + err)
      }
    },

    /* 
     * @method  downloadAudioFile
     * @brief   Downloads the audio file from the device
     *          
     */
    async downloadAudioFile(TpgDevice) {
      let deviceIndex = MTPDevices.findIndex(element => { if (element.SerialNumber === TpgDevice.config.SerialNumber) { return true; }})
      console.log("Downloading audio from:", MTPDevices[deviceIndex])
      TpgDevice.audioCopyTimeStarted = format(new Date(), 'MMMM d, H:mm:ss')
      let storageObjects = await this.getStorageIDS(MTPDevices[deviceIndex])
      if (storageObjects !== null) {
        let activeStorageID = storageObjects[0].storageID
        console.log("WebHub.vue:initializeMTP calling getFileObjects with activeStorageID:", activeStorageID)
        let fileObjects = await this.getFileObjects(MTPDevices[deviceIndex], activeStorageID)
        let fileObject = fileObjects.filter((fileObjects) => fileObjects.fileName === TPG_AUDIO_FILE)
        console.log("Downloading File:", fileObject)
        try {
          let [status, fileBlob] = await MTPDevices[deviceIndex].downloadAudioFile(
            activeStorageID,
            fileObject[0],
            TpgDevice
          )
          if (status === true) {
            TpgDevice.audioCopyTimeFinished = format(new Date(), 'MMMM d, H:mm:ss')
            console.log("File downloaded successfully.")

            // ToDo: Update the IndexedDB with the TpgDevice updates

            // return fileBlob
          }
        } catch (err) {
          console.log("Error downloading file. " + err)
          return null
        }
      }
    },

    /* 
     * @method  downloadFile
     * @brief   Download a text file from the device
     *          
     */
    async downloadFile(MTPDevice, storageID, fileID) {
      let storageObject = MTPDevice.storageInfoObjects.find((storageObject) => storageObject.storageID === storageID)
      let storageIndex = MTPDevice.storageInfoObjects.indexOf(storageObject)
      let fileObject = MTPDevice.storageInfoObjects[storageIndex].objectInfoObjects.find((fileObject) => fileObject.fileID === fileID)
      //try {
        let [status, fileBlob] = await MTPDevice.downloadFile(storageObject, fileObject)
        if (status === true) {
          console.log("File downloaded successfully.")
          return fileBlob
        }
      //} catch (err) {
      //  console.log("Error downloading file. " + err)
      //  return null
      //}
    },

    /* 
     * @method  downloadSettingsFileButton
     * @brief   Specifically download the Settings File from the device
     *          
     */
    async downloadSettingsFileButton(TpgDevice) {
      let deviceIndex = MTPDevices.findIndex(element => { if (element.SerialNumber === TpgDevice.config.SerialNumber) { return true; }})
      let currentSettings = await downloadSettingsFile(MTPDevices[deviceIndex])
      console.log("downloadSettingsFileButton: Config.txt", currentSettings)
      device.SerialNumber = currentSettings.config.SerialNumber
      this.$store.dispatch("updateDevice", currentSettings)
    },

    /* 
     * @method  downloadSettingsFile
     * @brief   Specifically download the Settings File from the device
     *          
     */
    async downloadSettingsFile(device) {
        let activeStorageID = device.storageInfoObjects[0].storageID
        let fileptr = device.storageInfoObjects[0].objectInfoObjects.filter((fileObject) => fileObject.fileName === TPG_CONFIG_FILE)
        let fileArray = await this.downloadFile(device, activeStorageID, fileptr[0].fileID)
        let fileData = Uint8Array.from(fileArray)
        let result = String.fromCharCode.apply(String, fileData)
        let config = this.stringToObj(result)

        let currentSettings = new deviceSettings()
        currentSettings.deviceConnected = format(new Date(), 'MMMM d, H:mm:ss')
        currentSettings.isConnected = true
        currentSettings.audioCopyTimeStarted = null
        currentSettings.audioCopyTimeFinished = null
        currentSettings.audioCopyBytes = 0
        currentSettings.audioCopyTotalBytes = 0
        currentSettings.audioCopyProgress = 0
        currentSettings.audioUploadedTimeStarted = null
        currentSettings.audioUploadTimeFinished = null
        currentSettings.audioUploadProgress = 0
        currentSettings.audioUploadBytes = 0
        currentSettings.config = config
        currentSettings.storageObjects = device.storageInfoObjects
        currentSettings.commandFile = null
        currentSettings.commandText = null
        currentSettings.commandBytes = null
      
        return currentSettings
      //}
    },

    /* 
     * @method    uploadSettingsFile
       * @brief   Specifically upload a Settings File to the device
     *          
     */
    async uploadSettingsFile(TpgDevice) {
      //try {
        let deviceIndex = MTPDevices.findIndex(element => { if (element.SerialNumber === TpgDevice.config.SerialNumber) { return true; }})
        let bytes = TpgDevice.config.commandText.split('').map (function (c) { return c.charCodeAt (0); })
        let activeStorageID = MTPDevices[deviceIndex].storageInfoObjects[0].storageID
        let storageObject = MTPDevices[deviceIndex].storageInfoObjects.find((storageObject) => storageObject.storageID === activeStorageID)
        let fileObject = MTPDevices[deviceIndex].storageInfoObjects[0].objectInfoObjects.filter((fileObject) => fileObject.fileName === TPG_COMMAND_FILE)

        // Delete the file
        await MTPDevices[deviceIndex].deleteFile(fileObject[0])


        // Put delay here to wait for file deletion?
        console.log("uploadSettingsFile:", MTPDevices[deviceIndex], activeStorageID, storageObject, fileObject[0], bytes.map(function(x) {return x.toString(16);}).join(" "))
        let [status1, newObjectID] = await MTPDevices[deviceIndex].uploadFileInfo(storageObject, TPG_COMMAND_FILE, bytes.length)

        let status2 = await MTPDevices[deviceIndex].uploadFile(bytes)
        
        console.log("File Upload Status", status1, status2, newObjectID)
        if (status1 === true && status2 === true) {
          console.log("Successfully uploaded the file.")
        }
      //} catch (err) {
      //  console.log("Error uploading file. ", err)
      //}
      // Wait 9 seconds then read the config file back and update the UI
      //setTimeout(() => { this.downloadSettingsFile(TpgDevice); }, 9000)
    },

    /* 
     * @method  uploadFile
     * @brief   Generic method to upload a file to the device
     *          
     */
    async uploadFile(MTPDevice, storageID, file, bytes, progressBar) {
      //try {
        let storageObject = MTPDevice.storageInfoObjects.find(
          (storageObject) => storageObject.storageID === storageID
        )
        console.log(storageObject)
        let [status1, newObjectID] = await MTPDevice.uploadFileInfo(
          storageObject,
          file.name,
          bytes.length
        )

        let status2 = await MTPDevice.uploadFile(
          storageObject,
          newObjectID,
          bytes,
          progressBar
        )
        console.log(status1, status2, newObjectID)

        if (status1 === true && status2 === true) {
          console.log("Successfully uploaded the file.")
        }
      //} catch (err) {
      //  console.log("Error uploading file. " + err)
      //  return null
      //}
    },

    /* 
     * @method  getStorageIDs
     * @brief   Returns the storageObjects on the device specified
     *          
     */
    async getStorageIDS(device) {
      try {
        let status1 = await device.getStorageIDS()
        let status2 = null
        for (const storageObject of device.storageInfoObjects) {
          status2 = await device.getStorageInfo(storageObject)
        }

        if (status1 === true && status2 === true) {
          console.log("Fetched storage IDS. Found " +device.storageInfoObjects.length + ".")
          return device.storageInfoObjects
        }
      } catch (err) {
        console.log("Error getting storage IDS. Error:" + err)
        return null
      }
    },

    /* 
     * @method  getFileObjects
     * @brief   Returns the fileObjects on the device specified
     *          
     */
    async getFileObjects(device, storageID) {
      try {
        let storageObject = device.storageInfoObjects.find((storageObject) => { return storageObject.storageID === storageID; })
        let storageObjectIndex = device.storageInfoObjects.indexOf(storageObject)
        let status1 = await device.getFileObjects(storageObject)
        let status2 = null
        for (const fileObject of device.storageInfoObjects[storageObjectIndex].objectInfoObjects) {
          status2 = await device.getFileObjectInfo(storageObject, fileObject)
        }
        if (status1 === true && status2 === true) {
          console.log("Fetched file objects. Found " + device.storageInfoObjects[storageObjectIndex].objectInfoObjects.length + ".")
          return device.storageInfoObjects[storageObjectIndex].objectInfoObjects
        }
      } catch (err) {
          console.log("Error getting file objects. Error:" + err)
          return null
      }
    },

    async deleteObject(MTPDevice, storageID, fileID) {
      try {
        let storageObject = MTPDevice.storageInfoObjects.find(
          (storageObject) => storageObject.storageID === storageID
        )
        let storageIndex = MTPDevice.storageInfoObjects.indexOf(storageObject)
        let fileObject = MTPDevice.storageInfoObjects[
          storageIndex
        ].objectInfoObjects.find((fileObject) => fileObject.fileID === fileID)
        console.log(
          MTPDevice.storageInfoObjects[storageIndex].objectInfoObjects
        )
        let status = await MTPDevice.deleteFile(
          storageObject,
          fileObject
        )

        if (status === true) {
          console.log("Successfully deleted the selected object")
        }
      } catch (err) {
        console.log("Unable to delete the selected file. " + err)
        return null
      }
    },

    async sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms))
    },

    stringToObj(string) {
      var obj = {}
      var stringArray = string.split(/\r\n|\r|\n/g)
      for (let i = 0; i < stringArray.length; i++) {
        var kvp = stringArray[i].split("=")
        if (kvp[1]) {
          obj[kvp[0]] = kvp[1]
        }
      }
      return obj
    },
  },
}
</script>
