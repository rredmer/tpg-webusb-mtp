/**
 *
 * Copyright (c) 2021-2024 Technical Products Group
 *
 * @file    mtpDriver.js
 * @date    Nov 25, 2021
 * @author  Ron Redmer <rredmer@techproductsgroup.com>
 * @brief   Driver for Universal Serial Bus (USB) Media Transfer Protocol (MTP) compliant to the 
 *          USB Media Transfer Protocol Specification v1.1 April 6, 2011 Standard. This file
 *          provides support for the MTP Device Model, Storage and Object Properties, and limited
 *          Operations to read and write file objects on devices.
 */

// MTP Container Types
const CONTAINER_TYPE_UNDEFINED = 0x0000
const MTP_PACKET_TYPE_COMMAND = 0x0001
const CONTAINER_TYPE_DATA = 0x0002
const CONTAINER_TYPE_RESPONSE = 0x0003
const CONTAINER_TYPE_EVENT = 0x0004

// MTP Operation Codes
const MTP_OPEN_SESSION = 0x1002
const MTP_GET_STORAGE_IDS = 0x1004
const MTP_GET_STORAGE_INFO = 0x1005
const GET_OBJECT_HANDLES = 0x1007
const GET_OBJECT_INFO = 0x1008
const GET_OBJECT = 0x1009
const CLOSE_SESSION = 0x1003
const MTP_DELETE_OBJECT = 0x100b
const SEND_OBJECT_INFO = 0x100c
const SEND_OBJECT = 0x100d

// MTP Object formats
const OBJECT_FORMAT_TEXT = 0x3004
const GET_ROOT_OBJECTS = 0xffffffff
const UNDEFINED_OBJECT_FORMAT = 0x3000
const PLACE_IN_ROOT = 0xffffffff

// MTP Response codes
const MTP_OK = 0x2001
const SESSION_ALREADY_OPEN = 0x201e

// General Purpose Constants
const MTP_PACKET_MAX_SIZE = 512             // The maximum length of an MTP packet according to the specification
const MTP_CONTAINER_ARRAY_LEN = 12          // The length of the MTP container array
const FILE_NAME_START = 65                  // Offset into header buffer for file name

// JavaScript Imports
import { format } from 'date-fns'           // Date formatting
import Localbase from 'localbase'           // Access to IndexedDB for local storage of audio BLOBS

let dbf = new Localbase('db')               // Pointer to IndexedDB
dbf.config.debug = false                    // Disable debug on database

/* 
 * @class   mtpPacket 
 * @brief   All data sent and received from an MTP device is prefixed with the MTP Packet Header.
 *          This should not to be confused with the USB header information, which is fixed in length
 *          at 24 bytes. In the following USB protocol sample, the MTP packet begins on the 12th byte
 *          of row 0010:
 * 
 *          0000   1b 00 60 7a fe 2f 89 dc ff ff 00 00 00 00 09 00   ..`z./..........
 *          0010   00 01 00 24 00 01 03 14 00 00 00 14 00 00 00 01   ...$............
 *          0020   00 0b 10 09 00 00 00 02 00 00 00 00 00 00 00      ...............
 * 
 *          In this packet, the mtpPacket info is:
 *          Container length [14 00 00 00] = 20 bytes
 *          Container Type [01 00] = MTP Command
 *          Operation [0b 10] - 0x100b = MTP_DELETE_OBJECT
 *          Transaction ID [09 00 00 00 00] = 9th MTP Transaction of the Session
 *          Parameter 1 [02 00 00 00] = The File ID to delete, which is specified as #2
 *          Parameter 2 [00 00 00 00] = The Parent Folder of the File to Delete
 * 
 */
class mtpPacket {
  constructor(parameterLength) {                      // Parameter length passed in bytes
    // Length of parameters in bytes at the end of MTP container 
    this.parameterArrayLength = parameterLength * 4   // Each parameter encoded as 4 bytes
    this.containerArrayLength = this.parameterArrayLength + MTP_CONTAINER_ARRAY_LEN

    // MTP Container Array definitions 
    this.container_array = new Uint8Array(this.containerArrayLength)
    this.parameters_array = new Uint8Array(this.parameterArrayLength)

    // MTP Container elements definitions
    this.type = 0
    this.operation = 0
    this.transaction_id = 0
    this.parameters = new Uint32Array(this.parameters_array)
  }

  // Set MTP Transaction Type
  setTransactionType(transactionType) {
    this.type = transactionType
  }

  // Set MTP Operation Type
  setOperation(operation) {
    this.operation = operation
  }

  // Set MTP Transaction ID 
  setTransactionID(transaction_id) {
    this.transaction_id = transaction_id
  }

  // Set MTP Parameters
  setParams(param1, param2, param3, param4, param5) {
    for (let i = 0; i < 4; i++) {
      this.parameters_array[i] = (param1 >> (i * 8)) & 0xff
    }
    for (let i = 0; i < 4; i++) {
      this.parameters_array[i + 4] = (param2 >> (i * 8)) & 0xff
    }
    for (let i = 0; i < 4; i++) {
      this.parameters_array[i + 8] = (param3 >> (i * 8)) & 0xff
    }
    for (let i = 0; i < 4; i++) {
      this.parameters_array[i + 12] = (param4 >> (i * 8)) & 0xff
    }
    for (let i = 0; i < 4; i++) {
      this.parameters_array[i + 16] = (param5 >> (i * 8)) & 0xff
    }
  }

  // Pack the container for MTP protocol transmission
  pack() {
    // Packing container length 
    for (let i = 0; i < 4; i++) {
      this.container_array[i] = (this.containerArrayLength >> (i * 8)) & 0xff
    }

    // Packing Container Type 
    this.container_array[4] = this.type & 0xff
    this.container_array[5] = (this.type >> 8) & 0xff

    // Packing Operation code
    this.container_array[6] = this.operation & 0xff
    this.container_array[7] = (this.operation >> 8) & 0xff

    // Packing transaction id 
    for (let i = 8; i < this.containerArrayLength - this.parameterArrayLength; i++) {
      this.container_array[i] = (this.transaction_id >> ((i - 8) * 8)) & 0xff
    }

    // Packing parameters
    for (let i = this.containerArrayLength - this.parameterArrayLength; i < this.containerArrayLength; i++) {
      this.container_array[i] = this.parameters_array[i - (this.containerArrayLength - this.parameterArrayLength)]
    }
  }
}

/* 
 * @class   storageInfoDataset
 * @brief   The storageInfoDataset is a standard MTP Object which describes storage contained in a device.
 * 
 */
const MTP_STORAGE_TYPE_UNDEFINED = 0x0000
const MTP_STORAGE_TYPE_FIXED_ROM = 0x0001
const MTP_STORAGE_TYPE_REMOVABLE_ROM = 0x0002
const MTP_STORAGE_TYPE_FIXED_RAM = 0x0003
const MTP_STORAGE_TYPE_REMOVABLE_RAM = 0x0004
const MTP_FILESYSTEM_TYPE_UNDEFINED = 0x0000
const MTP_FILESYSTEM_TYPE_GENERIC_FLAT = 0x0001
const MTP_FILESYSTEM_TYPE_GENERIC_HIERARCHICAL = 0x0002
const MTP_FILESYSTEM_TYPE_DCF = 0x0003
const MTP_ACCESS_READWRITE = 0x0000
const MTP_ACCESS_READONLY_DELETE = 0x0001
const MTP_ACCESS_READONLY_NODELETE = 0x0002

class storageInfoDataset {
  constructor(str_id) {
    this.storageID = str_id
    this.storageSize = 0
    this.usedSpace = 0
    this.freeSpace = 0
    this.storageDescLength = 0
    this.storageDescription = ""
    this.objectInfoObjects = new Array(0)
  }
  initDatasetFromMTPContainer(receivedBuf) {
    // Storage Size 
    let storageSize = 0
    for (let i = 18; i < 26; i++) {
      storageSize |= receivedBuf[i] << ((i - 10) * 8)
    }
    this.storageSize = storageSize

    // Free Space
    let freeSpace = 0
    for (let i = 26; i < 34; i++) {
      freeSpace |= receivedBuf[i] << ((i - 18) * 8)
    }
    this.freeSpace = freeSpace

    // Used Space
    this.usedSpace = storageSize - freeSpace

    // Storage Description
    this.baseAddr = 38
    this.storageDescLength =
      receivedBuf[this.baseAddr] |
      (receivedBuf[this.baseAddr + 1] << 8) |
      (receivedBuf[this.baseAddr + 2] << 16) |
      (receivedBuf[this.baseAddr + 3] << 24)
  }
}

/* 
 * @class   ObjectInfoDataset
 * @brief   The Object Info Dataset is a standard MTP Object which provides an overview of the core properties of an object.
 *          
 */
class ObjectInfoDataset {
  constructor(file_id) {
    this.containerLength = 52
    this.container_array = new Uint8Array(this.containerLength)
    this.container_array.fill(0)
    this.filename_array = new Uint8Array(0)
    this.concatArray = null
    this.fileID = file_id
    this.fileName = ""
    this.dateCreateLength = new Uint8Array(4)
    this.dateCreateLength = [0, 0, 0, 0x12]
    this.dateCreateArray = new Uint8Array(11+16+6)
    this.dateCreateArray = [0x32, 0x0, 0x30, 0x0, 0x32, 0x0, 0x32, 0x0, 0x30, 0x0, 0x33, 0x0, 0x31, 0x0, 0x35, 0x0, 0x54, 0x0, 0x30, 0x0, 0x39, 0x0, 0x33, 0x0, 0x37, 0x0, 0x34, 0x0, 0x30, 0x0, 0x2e, 0x0, 0x30]
    this.dateModLength = new Uint8Array(4)
    this.dateModLength = [0, 0, 0, 0x12]
    this.dateModArray = new Uint8Array(11+16+6)
    this.dateModArray = [0x32, 0x0, 0x30, 0x0, 0x32, 0x0, 0x32, 0x0, 0x30, 0x0, 0x33, 0x0, 0x31, 0x0, 0x35, 0x0, 0x54, 0x0, 0x30, 0x0, 0x39, 0x0, 0x33, 0x0, 0x37, 0x0, 0x34, 0x0, 0x30, 0x0, 0x2e, 0x0, 0x30]
    this.keywords = new Uint8Array(4)
    this.keywords = [0, 0, 0, 0]
  }

  setFileName(filenameArray) {
    this.fileName = bin2String(filenameArray)
  }

  initContainer(objectFormat, objectCompressedSize, associationType, associationDesc, filename) {
    // File Name 
    this.filename_array = new Uint8Array(filename.length * 2)
    this.fileName = filename
    let j = 0
    for (let i = 0; j < filename.length; i += 2) {
      if (i === 0) {
        this.filename_array[i] = filename.length + 1
        // RDR this.filename_array[i] = filename.length
      } else {
        this.filename_array[i] = 0
      }
      this.filename_array[i + 1] = filename.charCodeAt(j)
      j++
    }

    // Object Format
    for (let i = 4; i < 6; i++) {
      this.container_array[i] = (objectFormat >> ((i - 8) * 8)) & 0xff
    }

    // Object Size (bytes)
    for (let i = 8; i < MTP_CONTAINER_ARRAY_LEN; i++) {
      this.container_array[i] = (objectCompressedSize >> ((i - MTP_CONTAINER_ARRAY_LEN) * 8)) & 0xff
    }

    // RDR - MISSING 13 TO 41 FROM PACKET ANALYSIS - the following value was reverse engineered from working protocol
    this.container_array[13] = 0x30

    // Association Type 
    for (let i = 42; i < 44; i++) {
      this.container_array[i] = (associationType >> ((i - 42) * 8)) & 0xff
    }

    // Association Description
    for (let i = 44; i < 48; i++) {
      this.container_array[i] = (associationDesc >> ((i - 44) * 8)) & 0xff
    }
  }
}

/*
 * @class   MTPDevice
 * @brief   This class implements the MTP protocol for a single attached USB Device.
 * 
 */
export default class MTPDevice {

  constructor() {
    this.device = null                         // Pointer to USB Device Object
    this.interfaceNumber = 0                   // The MTP interface Number
    this.endpointIn = 0                        // MTP Endpoint for Input (receive)
    this.endpointOut = 0                       // MTP EndPoint to Output (transmit)
    this.sessionOpen = false                   // Pointer to MTP Session
    this.sessionID = 1                         // MTP Session ID
    this.storageInfoObjects = new Array(0)     // Array of MTP StorageInfo Objects
    this.objectInfoObjects = new Array(0)      // Array of MTP ObjectInfo Objects
    this.transactionID = 0                     // The MTP Transaction ID for the current Session
    this.SerialNumber = null                   // SerialNumber is a extension to the standard MTP (Devices do not use hard-coded Serial Numbers)
  }

  /*
   * @method  getEndpoints
   * @brief   Retrieve USB End Points for MTP communication
   * 
   */ 
  async getEndpoints() {
    var configurationInterfaces = this.device.configuration.interfaces
    console.log("Interface:", configurationInterfaces)
    let element = configurationInterfaces[0]    // Only the first Interface is supported
    element.alternates.forEach((elementalt) => {
      this.interfaceNumber = element.interfaceNumber
      elementalt.endpoints.forEach((elementendpoint) => {
        if (elementendpoint.direction === "out" && elementendpoint.type === "bulk") {
          this.endpointOut = elementendpoint.endpointNumber
          console.log("MTPDevice.getEndPoints Output Endpoint (bulk):", this.endpointOut)
        }
        if (elementendpoint.direction === "in" && elementendpoint.type === "bulk") {
          this.endpointIn = elementendpoint.endpointNumber
          console.log("MTPDevice.getEndPoints Input Endpoint (bulk):", this.endpointIn)
        }
        if (elementendpoint.direction === "in" && elementendpoint.type === "interrupt") {
          //this.endpointIn = elementendpoint.endpointNumber
          console.log("MTPDevice.getEndPoints Input Endpoint (interrupt):", elementendpoint.endpointNumber)
        }
      })
    })
  }

  /*
   * @method  receivePackets
   * @brief   Process packets received
   * 
   * NOTE: This routine needs a timeout to break the loop
   * 
   */
  receivePackets(device, no_of_packets) {
    let receivedBuffer = new Array(0)
    let i = 0
    return new Promise((resolve) => {
      while (true) {
        if (i === no_of_packets) {
          Promise.all(receivedBuffer).then(() => {
            let rawData = new Array(0)
            for (let i = 0; i < no_of_packets; i++) {
              receivedBuffer[i].then((result) => {
                rawData.push(result)
              })
            }
            resolve(rawData)
          })
          break
        } else {
          i++
          receivedBuffer.push(this.getPacket(device))
          console.log("MTP.receivedPackets RAW:", receivedBuffer)
        }
      }
    })
  }

  /*
   * @method  getPacket
   * @brief   Read a Packet directly from the Device USB
   * 
   */
  getPacket(device) {
    return new Promise((resolve) => {
      device.device.transferIn(device.endpointIn, MTP_PACKET_MAX_SIZE).then((result) => {
        resolve(new Uint8Array(result.data.buffer))
      })
    })
  }

  /*
   * @method  openSession
   * @brief   Open the MTP Session for communication. The MTP Command is 0x1002.
   * 
   * Protocol (original WebUSB)
   * 0000   1b 00 e0 38 b2 26 86 8e ff ff 00 00 00 00 09 00   ...8.&..........
   * 0010   00 01 00 33 00 01 03 20 00 00 00 20 00 00 00 01   ...3... ... ....
   * 0020   00 02 10 01 00 00 00 00 00 00 00 01 00 00 00 00   ................
   * 0030   00 00 00 00 00 00 00 00 00 00 00                  ...........
   *
   * Packet Length: 0x20
   * Packet Type:   0x01    (Command packet)
   * Operation:     0x1002  (Open Session)
   * Transaction:   0x01
   * SessionID:     0x00
   * Unknown Parm:  0x01
   * 
   * Protocol (new version, this code was revised to match the Windows MTP Driver)
   * 0000   1b 00 e0 48 b4 26 86 8e ff ff 00 00 00 00 09 00   ...H.&..........
   * 0010   00 01 00 36 00 01 03 10 00 00 00 10 00 00 00 01   ...6............
   * 0020   00 02 10 00 00 00 00 01 00 00 00                    ...........
   *
   * Packet Length: 0x20
   * Packet Type:   0x01    (Command packet)
   * Operation:     0x1002  (Open Session)
   * Transaction:   0x00
   * SessionID:     0x01
   *
   * Response Packet:
   * 0000   1b 00 60 79 dd 1f 86 8e ff ff 00 00 00 00 09 00   ..`y............
   * 0010   01 01 00 36 00 81 03 0c 00 00 00 0c 00 00 00 03   ...6............
   * 0020   00 01 20 00 00 00 00                              .. ....
   * 
   * Packet Length: 0x0c
   * Packet Type:   0x03    (Response packet)
   * Response Code: 0x2001  (MTP_OK - No errors)
   * Transaction:   0x00
   * 
   */
  async openSession() {
    let device = this
    let promise = new Promise(function(resolve) {
      device.device.transferIn(device.endpointIn, MTP_PACKET_MAX_SIZE).then((result) => {
        let receivedBuffer = new Uint8Array(result.data.buffer)
        device.logPacket("MTPDevice.openSession", receivedBuffer)
        // Confirm successful response from device
        if ((((receivedBuffer[7] << 8) | receivedBuffer[6]) === MTP_OK) || 
            (((receivedBuffer[7] << 8) | receivedBuffer[6]) === SESSION_ALREADY_OPEN)) {
          console.log("OpenSession transaction: ", device.transactionID, receivedBuffer[8])
          device.sessionOpen = true
          resolve(true)
        } else {
          device.sessionOpen = false
          throw "Unhandled exception when opening session."
        }
        })
      .catch((err) => {
        console.log("MTPDevice.openSession Error opening session. ", err)
        resolve(false)
      })
    })
    let openSession = new mtpPacket(1)
    openSession.setTransactionType(MTP_PACKET_TYPE_COMMAND)
    openSession.setOperation(MTP_OPEN_SESSION)
    openSession.setTransactionID(this.transactionID)
    openSession.setParams(this.sessionID, 0, 0, 0, 0)
    openSession.pack()
    await this.sendPacket(openSession.container_array)
    return promise
  }

  /*
   * @method  closeSession
   * @brief   Close the MTP Session (soft-eject device)
   * 
   */
  async closeSession() {
    let device = this
    let disconnectPromise = new Promise(function(resolve) {
      device.device.transferIn(device.endpointIn, MTP_PACKET_MAX_SIZE).then((result) => {
        let receivedBuffer = new Uint8Array(result.data.buffer)
        device.logPacket("MTPDevice.closeSession", receivedBuffer)
        // Confirm successful response from device
        if (((receivedBuffer[7] << 8) | receivedBuffer[6]) === MTP_OK) {
          device.sessionOpen = false
          resolve(true)
        } else {
          throw "Unhandled exception when closing session."
        }
      })
      .catch((err) => {
        console.log("MTPDevice.closeSession Error closing session.", err)
        resolve(false)
      })
    })
    // Close the session
    let closeSessionRequest = new mtpPacket(0)
    closeSessionRequest.setOperation(CLOSE_SESSION)
    closeSessionRequest.setTransactionType(MTP_PACKET_TYPE_COMMAND)
    closeSessionRequest.setTransactionID(++this.transactionID)
    closeSessionRequest.pack()
    this.device.transferOut(this.endpointOut, closeSessionRequest.container_array)
    return disconnectPromise
  }

  /*
   * @method  getStorageIDS
   * @brief   Retrieve all of the Storage IDs from the device.
   * 
   * Protocol:
   * 0000   1b 00 e0 88 e6 22 86 8e ff ff 00 00 00 00 09 00   ....."..........
   * 0010   00 01 00 36 00 01 03 0c 00 00 00 0c 00 00 00 01   ...6............
   * 0020   00 04 10 00 00 00 00                              .......
   *
   *  Packet Length:  0x0c
   *  Packet Type:    0x01      (MTP Command)
   *  Operation:      0x1004    (Get Storage IDs)
   *  Transaction:    0x00
   * 
   * Response Packet:
   * 0000   1b 00 60 79 d4 1f 86 8e ff ff 00 00 00 00 09 00   ..`y............
   * 0010   01 01 00 36 00 81 03 0c 00 00 00 0c 00 00 00 03   ...6............
   * 0020   00 01 20 01 00 00 00                              .. ....
   * 
   * Packet Length: 0x0c
   * Packet Type:   0x03    (Response packet)
   * Response Code: 0x2001  (MTP_OK - No errors)
   * Transaction:   0x00
   * 
   */
  async getStorageIDS() {
    let device = this
    let results = this.receivePackets(device, 2)
    let storageIDSPromise = new Promise(function(resolve) {
      let storageIDBuffer = null
      let MTP_OKBuffer = null
      results
        .then((receivedPackets) => {
          if (((receivedPackets[0][7] << 8) | receivedPackets[0][6]) === MTP_GET_STORAGE_IDS) {
            storageIDBuffer = receivedPackets[0]
            MTP_OKBuffer = receivedPackets[1]
          } else {
            storageIDBuffer = receivedPackets[1]
            MTP_OKBuffer = receivedPackets[0]
          }
          device.logPacket("MTPDevice.getStorageIDs StorageID:", storageIDBuffer)
          device.logPacket("MTPDevice.getStorageIDs  MTP Resp:", MTP_OKBuffer)
          console.log("getStorageIDs transaction: ", device.transactionID, MTP_OKBuffer[8])
          if (((MTP_OKBuffer[7] << 8) | MTP_OKBuffer[6]) === MTP_OK) {
            // Retrieve Storage IDs from the MTP message
            device.storageInfoObjects = new Array(0)
            let numberOfStorageIDS =
              storageIDBuffer[12] |
              (storageIDBuffer[13] << 8) |
              (storageIDBuffer[14] << 16) |
              (storageIDBuffer[15] << 24)
            let readBase = 16
            for (let i = 0; i < numberOfStorageIDS; i++) {
              let storage_id =
                storageIDBuffer[readBase + i * 4] |
                (storageIDBuffer[readBase + 1 + i * 4] << 8) |
                (storageIDBuffer[readBase + 2 + i * 4] << 16) |
                (storageIDBuffer[readBase + 3 + i * 4] << 24)
              device.storageInfoObjects.push(new storageInfoDataset(storage_id))
            }
            resolve(true)
          } else {
            throw "Unhandled exception when fetching storage IDs."
          }
        })
        .catch((err) => {
          console.log("MTPDevice.getStorageIDs Error getting storage IDs. " + err)
          resolve(false)
        })
    })
    // Get Storage IDs from the device
    let getStorageIDS = new mtpPacket(0)
    getStorageIDS.setTransactionType(MTP_PACKET_TYPE_COMMAND)
    getStorageIDS.setOperation(MTP_GET_STORAGE_IDS)
    getStorageIDS.setTransactionID(++this.transactionID)
    getStorageIDS.pack()
    await this.sendPacket(getStorageIDS.container_array)
    return storageIDSPromise
  }

  /*
   * @method  getStorageInfo
   * @brief   Retrieve StorageInfo object for a specified Storage ID
   * 
   * Protocol:
   * 0000   1b 00 e0 e8 b6 1e 86 8e ff ff 00 00 00 00 09 00   ................
   * 0010   00 01 00 36 00 01 03 10 00 00 00 10 00 00 00 01   ...6............
   * 0020   00 05 10 02 00 00 00 01 00 01 00                  ...........
   * 
   * *
   *  Packet Length:  0x10
   *  Packet Type:    0x01      (MTP Command)
   *  Operation:      0x1005    (Get Storage IDs)
   *  Transaction:    0x02
   * 
   * Response Packet:
   * 0000   1b 00 60 79 d4 1f 86 8e ff ff 00 00 00 00 09 00   ..`y............
   * 0010   01 01 00 36 00 81 03 0c 00 00 00 0c 00 00 00 03   ...6............
   * 0020   00 01 20 01 00 00 00                              .. ....
   * 
   * Packet Length: 0x0c
   * Packet Type:   0x03    (Response packet)
   * Response Code: 0x2001  (MTP_OK - No errors)
   * Transaction:   0x00
   * 
   */
  async getStorageInfo(storageObject) {
    let device = this
    let results = this.receivePackets(device, 2)
    let storageInfoPromise = new Promise(function(resolve) {
      let storageInfoBuffer = null
      let MTP_OKBuffer = null
      results.then((receivedPackets) => {
        if (((receivedPackets[0][7] << 8) | receivedPackets[0][6]) === MTP_GET_STORAGE_INFO) {
          storageInfoBuffer = receivedPackets[0]
          MTP_OKBuffer = receivedPackets[1]
        } else {
          storageInfoBuffer = receivedPackets[1]
          MTP_OKBuffer = receivedPackets[0]
        }
        device.logPacket("MTPDevice.getStorageInfo StorageID:", storageInfoBuffer)
        device.logPacket("MTPDevice.getStorageInfo MTP Resp:", MTP_OKBuffer)
        console.log("getStorageIinfo transaction: ", device.transactionID, MTP_OKBuffer[8])
        if (((MTP_OKBuffer[7] << 8) | MTP_OKBuffer[6]) === MTP_OK) {
          // Retrieve object from message
          storageObject.initDatasetFromMTPContainer(storageInfoBuffer)
          console.log("MTPDevice.getStorageInfo", storageObject)
          resolve(true)
        } else {
          throw "Unhandled exception when fetching storage info."
        }
      })
      .catch((err) => {
        console.log("Error getting storage IDs. ", err)
        resolve(false)
      })
    })
    // Get StorageInfo object from the device
    let reqStorageInfo = new mtpPacket(1)
    reqStorageInfo.setTransactionID(++this.transactionID)
    reqStorageInfo.setTransactionType(MTP_PACKET_TYPE_COMMAND)
    reqStorageInfo.setOperation(MTP_GET_STORAGE_INFO)
    reqStorageInfo.setParams(storageObject.storageID, 0, 0, 0, 0)
    reqStorageInfo.pack()
    await this.sendPacket(reqStorageInfo.container_array)
    return storageInfoPromise
  }

  /*
   * @method  getFileObjects
   * @brief   Retrieve all of the FileObjects contained in a specified Storage Object
   * 
   */
  async getFileObjects(storageObject) {
    let device = this
    let results = this.receivePackets(device, 2)
    let objectIDSPromise = new Promise(function(resolve) {
      let objectIDBuffer = null
      let MTP_OKBuffer = null
      console.log("MTPDevice.getFileObjects storageObject:", storageObject)
      let storageIDIndex = device.storageInfoObjects.indexOf(storageObject)
      console.log("MTPDevice.getFileObjects storageIDIndex:", storageIDIndex)
      results.then((receivedPackets) => {
        if (((receivedPackets[0][7] << 8) | receivedPackets[0][6]) === GET_OBJECT_HANDLES) {
          console.log("MTPDevice.getFileObjects.GET_OBJECT_HANDLES if:", GET_OBJECT_HANDLES)
          objectIDBuffer = receivedPackets[0]
          MTP_OKBuffer = receivedPackets[1]
        } else {
          console.log("MTPDevice.getFileObjects.GET_OBJECT_HANDLES else:", GET_OBJECT_HANDLES)
          objectIDBuffer = receivedPackets[1]
          MTP_OKBuffer = receivedPackets[0]
        }
        device.logPacket("MTPDevice.getFileObjects ObjectID:", objectIDBuffer)
        device.logPacket("MTPDevice.getFileObjects MTP Resp:", MTP_OKBuffer)
        console.log("getFileObjects MTP transaction: ", device.transactionID, MTP_OKBuffer[8])
        if (((MTP_OKBuffer[7] << 8) | MTP_OKBuffer[6]) === MTP_OK) {
          // Retrieve objects from message
          device.storageInfoObjects[storageIDIndex].objectInfoObjects = new Array(0)
          let numberOfObjectIDS =
            objectIDBuffer[12] |
            (objectIDBuffer[13] << 8) |
            (objectIDBuffer[14] << 16) |
            (objectIDBuffer[15] << 24)
          let readBase = 16
          for (let i = 0; i < numberOfObjectIDS; i++) {
            let object_id =
              objectIDBuffer[readBase + i * 4] |
              (objectIDBuffer[readBase + 1 + i * 4] << 8) |
              (objectIDBuffer[readBase + 2 + i * 4] << 16) |
              (objectIDBuffer[readBase + 3 + i * 4] << 24)
            device.storageInfoObjects[storageIDIndex].objectInfoObjects.push(new ObjectInfoDataset(object_id))
          }
          resolve(true)
        } else {
          throw "Unhandled exception when fetching storage IDs."
        }
      })
      .catch((err) => {
        console.log("Error getting getFileObjects. " + err)
        resolve(false)
      })
    })
    // Get FileObjects from device
    let reqObjHandles = new mtpPacket(3)
    reqObjHandles.setTransactionID(++this.transactionID)
    reqObjHandles.setTransactionType(MTP_PACKET_TYPE_COMMAND)
    reqObjHandles.setOperation(GET_OBJECT_HANDLES)
    reqObjHandles.setParams(storageObject.storageID, 0, GET_ROOT_OBJECTS, 0, 0)
    reqObjHandles.pack()
    await this.sendPacket(reqObjHandles.container_array)
    return objectIDSPromise
  }

  /*
   * @method  getFileObjectInfo
   * @brief   Retrieve detailed FileInfo for a specified FileObject
   * 
   */
  async getFileObjectInfo(storageObject, fileObject) {
    let device = this
    let storageIndex = device.storageInfoObjects.indexOf(storageObject)
    let fileObjectIndex = device.storageInfoObjects[storageIndex].objectInfoObjects.indexOf(fileObject)
    let results = this.receivePackets(device, 2)
    let objectInfoPromise = new Promise(function(resolve) {
      let objectInfoBuffer = null
      let MTP_OKBuffer = null
      results.then((receivedPackets) => {
        if (((receivedPackets[0][7] << 8) | receivedPackets[0][6]) === GET_OBJECT_INFO) {
          objectInfoBuffer = receivedPackets[0]
          MTP_OKBuffer = receivedPackets[1]
        } else {
          objectInfoBuffer = receivedPackets[1]
          MTP_OKBuffer = receivedPackets[0]
        }
        device.logPacket("MTP.getFileObjectInfo ObjectID:", objectInfoBuffer)
        device.logPacket("MTP.getFileObjectInfo MTP Resp:", MTP_OKBuffer)
        if (((MTP_OKBuffer[7] << 8) | MTP_OKBuffer[6]) === MTP_OK) {
          let fileNameLength = objectInfoBuffer[FILE_NAME_START - 1] * 2
          let i = 0
          let sliced_name_array = objectInfoBuffer.slice(FILE_NAME_START, FILE_NAME_START + fileNameLength)
          let file_name_array = new Uint8Array(sliced_name_array.length / 2 - 1)
          for (let j = 0; j < sliced_name_array.length; j += 2) {
            file_name_array[i] = sliced_name_array[j]
            i++
          }
          device.storageInfoObjects[storageIndex].objectInfoObjects[fileObjectIndex].setFileName(file_name_array)
          device.storageInfoObjects[storageIndex].objectInfoObjects[fileObjectIndex].filesize =
            objectInfoBuffer[20] |
            (objectInfoBuffer[21] << 8) |
            (objectInfoBuffer[22] << 16) |
            (objectInfoBuffer[23] << 24)
          resolve(true)
        } else {
          throw "Unhandled exception when fetching storage IDs."
        }
      })
      .catch((err) => {
        console.log("Error getting Object Info. ", err)
        resolve(false)
      })
    })
    // Get FileInfo object from device
    let getObjInfo = new mtpPacket(1)
    getObjInfo.setTransactionType(MTP_PACKET_TYPE_COMMAND)
    getObjInfo.setOperation(GET_OBJECT_INFO)
    getObjInfo.setTransactionID(++this.transactionID)
    getObjInfo.setParams(fileObject.fileID, 0, 0, 0, 0)
    getObjInfo.pack()
    await this.sendPacket(getObjInfo.container_array)
    return objectInfoPromise
  }

  /*
   * @method  downloadAudioFile
   * @brief   Modification of downloadFile to handle large files
   * 
   */
  async downloadAudioFile(storageObject, fileObject, lenaDevice) {
    let device = this
    let results = this.receivePackets(device, 1)
    let downloadPromise = new Promise(function(resolve) {
      let firstObjectBuffer = new Uint8Array(0)
      let fileLength = null
      let objectBuffer = new Array(0)
      let progress= 0
      results.then(async (receivedPackets) => {
        firstObjectBuffer = receivedPackets[0]
        if (((firstObjectBuffer[7] << 8) | firstObjectBuffer[6]) === GET_OBJECT) {
          fileLength =
            (firstObjectBuffer[0] |
              (firstObjectBuffer[1] << 8) |
              (firstObjectBuffer[2] << 16) |
              (firstObjectBuffer[3] << 24)) -
              MTP_CONTAINER_ARRAY_LEN
          objectBuffer.push.apply(objectBuffer, firstObjectBuffer.slice(MTP_CONTAINER_ARRAY_LEN, firstObjectBuffer.length))

          let numberOfPacketsToBeReceived = Math.ceil((fileLength - objectBuffer.length) / MTP_PACKET_MAX_SIZE)
          //lenaDevice.audioCopyBytes = objectBuffer.length
          lenaDevice.audioCopyTotalBytes = fileLength
          console.log("Number of packets: ", numberOfPacketsToBeReceived)
          let range = Array.from(Array(numberOfPacketsToBeReceived).keys())
          let blobCount = 0
          for (const i of range) {
            await device.device.transferIn(device.endpointIn, MTP_PACKET_MAX_SIZE).then((result) => {
              let data = new Uint8Array(result.data.buffer)
              // Stuff the info into objectBuffer - this is what blows up...
              objectBuffer.push.apply(objectBuffer, data)
              blobCount++
              if (blobCount % 50000 === 0) {
                let newBlob = {
                  id: Date.now(),
                  blobNumber: blobCount,
                  fileBlob: objectBuffer
                }
                dbf.collection('fileblobs').add(newBlob).then()
                progress = ((i / numberOfPacketsToBeReceived) * 100).toFixed(1)
                if(lenaDevice) {
                  lenaDevice.audioCopyBytes = (lenaDevice.audioCopyBytes + objectBuffer.length)
                  lenaDevice.audioCopyProgress = progress
                }
                console.log("Progress: ", progress)
                objectBuffer = []
              }
            })
          }
          // Save last blob from final range that does not end on the 50,000 block boundary
          let newBlob = {
            id: Date.now(),
            blobNumber: blobCount,
            fileBlob: objectBuffer
          }
          if (lenaDevice) {
            lenaDevice.audioCopyBytes = (lenaDevice.audioCopyBytes + objectBuffer.length)
          }
          dbf.collection('fileblobs').add(newBlob).then()
          objectBuffer = []

          // Read in any last data remaining on the USB bus
          await device.device
            .transferIn(device.endpointIn, MTP_PACKET_MAX_SIZE)
            .then((result) => {
              resolve([true, objectBuffer])
              let newBlob = {
                id: Date.now(),
                blobNumber: blobCount+1,
                fileBlob: objectBuffer
              }
              dbf.collection('fileblobs').add(newBlob).then()
              if(lenaDevice) {
                progress = 100
                lenaDevice.audioCopyBytes = (lenaDevice.audioCopyBytes + objectBuffer.length)
                lenaDevice.audioCopyProgress = progress
              }
              objectBuffer = []
            })
        } else {
          throw "Unhandled exception when initiating download."
        }
      })
      .catch((err) => {
        console.log("Error getting file. ", err)
        resolve(false)
      })
    })
    // Request the Audio File
    let reqObj = new mtpPacket(1)
    reqObj.setTransactionID(++this.transactionID)
    reqObj.setTransactionType(MTP_PACKET_TYPE_COMMAND)
    reqObj.setOperation(GET_OBJECT)
    reqObj.setParams(fileObject.fileID, 0, 0, 0, 0)
    reqObj.pack()
    await this.sendPacket(reqObj.container_array)
    return downloadPromise
  }

  /*
   * @method  downloadFile
   * @brief   Download a file from the device
   * 
   */
  async downloadFile(storageObject, fileObject) {
    let device = this
    let results = device.receivePackets(device, 1)
    let downloadPromise = new Promise(function(resolve) {
      let firstObjectBuffer = new Uint8Array(0)
      let fileLength = null
      let objectBuffer = new Array(0)
      results
        .then(async (receivedPackets) => {
          firstObjectBuffer = receivedPackets[0]
          if (((firstObjectBuffer[7] << 8) | firstObjectBuffer[6]) === GET_OBJECT) {
            fileLength =
              (firstObjectBuffer[0] |
                (firstObjectBuffer[1] << 8) |
                (firstObjectBuffer[2] << 16) |
                (firstObjectBuffer[3] << 24)) -
                MTP_CONTAINER_ARRAY_LEN

            console.log("DownloadFile transaction: ", device.transactionID, firstObjectBuffer[8])

            objectBuffer.push.apply(objectBuffer, firstObjectBuffer.slice(MTP_CONTAINER_ARRAY_LEN, firstObjectBuffer.length))
            let numberOfPacketsToBeReceived = Math.ceil((fileLength - objectBuffer.length) / MTP_PACKET_MAX_SIZE)
            console.log("Number of packets: ", numberOfPacketsToBeReceived)
            let range = Array.from(Array(numberOfPacketsToBeReceived).keys())
            for (const i of range) {
              await device.device
                .transferIn(device.endpointIn, MTP_PACKET_MAX_SIZE)
                .then((result) => {
                  let data = new Uint8Array(result.data.buffer)
                  objectBuffer.push.apply(objectBuffer, data)
                })
            }

            await device.device.transferIn(device.endpointIn, MTP_PACKET_MAX_SIZE).then((result) => {

                // Test objectBuffer here?
                //console.log("DownloadFile 2 transaction: ", device.transactionID, objectBuffer[8])

                resolve([true, objectBuffer])
              })
          } else {
            throw "Unhandled exception when initiating download."
          }
        })
        .catch((err) => {
          console.log("Error getting file. ", err)
          resolve(false)
        })
    })
    // Request the File 
    let reqObj = new mtpPacket(1)
    reqObj.setTransactionID(++this.transactionID)
    reqObj.setTransactionType(MTP_PACKET_TYPE_COMMAND)
    reqObj.setOperation(GET_OBJECT)
    reqObj.setParams(fileObject.fileID, 0, 0, 0, 0)
    reqObj.pack()
    await this.sendPacket(reqObj.container_array)
    return downloadPromise
  }


  /*
   * @method  deleteFile
   * @brief   Delete a file from the device
   * 
   * Protocol:
   * 0000   1b 00 60 7a fe 2f 89 dc ff ff 00 00 00 00 09 00   ..`z./..........
   * 0010   00 01 00 24 00 01 03 14 00 00 00 14 00 00 00 01   ...$............
   * 0020   00 0b 10 09 00 00 00 02 00 00 00 00 00 00 00      ...............
   * 
   * Packet Length:  0x14
   * Container Type: 0x0001
   * Operation Code: 0x100B
   * Parameter 1:    The File ID of the object to delete
   * Parameter 2:    None
   * Parameter 3:    None
   * Parameter 4:    None
   * Parameter 5:    None
   * 
   */
  async deleteFile(fileObject) {
    let device = this
    let result = device.receivePackets(device, 1)   
    let deletePromise = new Promise(function(resolve) {
      result.then((receivedPackets) => {
        if (((receivedPackets[0][7] << 8) | receivedPackets[0][6]) === MTP_OK) {
          device.logPacket("MTPDevice.deleteFile Resp:", receivedPackets[0])
          console.log("deleteFile transaction: ", device.transactionID, receivedPackets[0][8])
          resolve(true)
        } else {
          throw "Deletion unsuccessful!"
        }
      })
      .catch((err) => {
        console.log("MTPDevice.deleteFile Error ", err)
        resolve(false)
      })
    })
    // Delete the file. NOTE: RDR reverse engineered the protocol to determine the packet format, this is not well documented in the spec.
    console.log("Deleting", fileObject, fileObject.fileID)
    let delete_packet = new mtpPacket(2)
    delete_packet.setTransactionID(++this.transactionID)
    delete_packet.setTransactionType(MTP_PACKET_TYPE_COMMAND)
    delete_packet.setOperation(MTP_DELETE_OBJECT)
    delete_packet.setParams(fileObject.fileID, 0, 0, 0, 0)
    delete_packet.pack()
    await this.sendPacket(delete_packet.container_array)
    return deletePromise
  }

  /*
   * @method  SendObjectInfo 
   * @brief   The SendObjectInfo method is required to begin a SendObject transfer to the device. There are two
   *          packets required for this command. The first packet identifies the file object and parent folder
   *          and the second packet contains the file name, creation and last modificiation dates.
   * 
   * Protocol:
   * H->D : Command #1: 0x100C, Upload File Info packet #1
   * 0000   1b 00 60 ca 0d 10 89 dc ff ff 00 00 00 00 09 00   ..`.............
   * 0010   00 01 00 24 00 01 03 14 00 00 00 14 00 00 00 01   ...$............
   * 0020   00 0c 10 0a 00 00 00 01 00 01 00 ff ff ff ff      ...............
   *
   * Packet Length:  0x14
   * Container Type: 0x0001
   * Operation Code: 0x100C
   * Parameter 1:    Destination Storage ID on responder
   * Parameter 2:    Parent ObjectHandle on responder where object shall be placed
   * Parameter 3:    None
   * Parameter 4:    None
   * Parameter 5:    None
   *
   * H->D : Command #2: 0x100C, Upload File Info packet #2
   * 0000   1b 00 60 2a 18 24 89 dc ff ff 00 00 00 00 09 00   ..`*.$..........
   * 0010   00 01 00 24 00 01 03 a4 00 00 00 a4 00 00 00 02   ...$............
   * 0020   00 0c 10 0a 00 00 00 00 00 00 00 00 30 00 00 2e   ............0...
   * 0030   00 00 00 00 30 00 00 00 00 00 00 00 00 00 00 00   ....0...........
   * 0040   00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00   ................
   * 0050   00 00 00 00 00 00 00 00 00 00 00 0c 63 00 6f 00   ............c.o.
   * 0060   6d 00 6d 00 61 00 6e 00 64 00 2e 00 74 00 78 00   m.m.a.n.d...t.x.
   * 0070   74 00 00 00 12 32 00 30 00 32 00 32 00 30 00 33   t....2.0.2.2.0.3
   * 0080   00 31 00 35 00 54 00 30 00 39 00 33 00 37 00 34   .1.5.T.0.9.3.7.4
   * 0090   00 30 00 2e 00 30 00 00 00 12 32 00 30 00 32 00   .0...0....2.0.2.
   * 00a0   32 00 30 00 33 00 31 00 35 00 54 00 30 00 39 00   2.0.3.1.5.T.0.9.
   * 00b0   33 00 37 00 31 00 31 00 2e 00 30 00 00 00 00      3.7.1.1...0....
   * 
   * Packet Length:  0xa4
   * Container Type: 0x0001
   * Operation Code: 0x100C
   * Parameter 1:    None
   * Parameter 2:    None
   * Parameter 3:    None
   * Parameter 4:    None
   * Parameter 5:    None
   * Data:           ObjectInfo dataset
   * 
   * Response:
   * 0000   1b 00 a0 c8 c1 2b 89 dc ff ff 00 00 00 00 09 00   .....+..........
   * 0010   01 01 00 24 00 81 03 18 00 00 00 18 00 00 00 03   ...$............
   * 0020   00 01 20 0a 00 00 00 01 00 01 00 00 00 00 00 02   .. .............
   * 0030   00 00 00
   * 
  */
  async uploadFileInfo(storageObject, filename, fileSize) {
    let device = this 
    let result = device.receivePackets(device, 2)      // Was 1
    let uploadFileInfoPromise = new Promise(function(resolve) {
      let objectInfoBuffer = ""
      let MTP_OKBuffer = ""
      result.then((receivedPackets) => {
        if (((receivedPackets[0][7] << 8) | receivedPackets[0][6]) === SEND_OBJECT_INFO) {
          objectInfoBuffer = receivedPackets[0]
          MTP_OKBuffer = receivedPackets[1]
        } else {
          objectInfoBuffer = receivedPackets[1]
          MTP_OKBuffer = receivedPackets[0]
        }
        device.logPacket("MTP.uploadFileInfo ObjectID:", objectInfoBuffer)
        device.logPacket("MTP.uploadObjectInfo MTP Resp:", MTP_OKBuffer)
        console.log("uploadFileInfo transaction (OBJ): ", device.transactionID, objectInfoBuffer[8])
        console.log("uploadFileInfo transaction MTP  : ", device.transactionID, MTP_OKBuffer[8])
        
        if (((MTP_OKBuffer[7] << 8) | MTP_OKBuffer[6]) === MTP_OK) {
          let newObjectID = 0
          for (let i = 20; i < 24; i++) {
            newObjectID |= (objectInfoBuffer[i] >> ((i - 20) * 8)) & 0xff
          }

          resolve([true, newObjectID])
        } else {
          throw "File Info upload unsuccessful!"
        }
      })
    }).catch((err) => {
      console.log("MTPDevice.uploadFileInfo Error.", err)
      resolve(false)
    })
    // Send theSendObjectInfo command to the device - this is accomplished in two packets, this first has 2 parameters
    let sendObjInfo = new mtpPacket(2)
    sendObjInfo.setOperation(SEND_OBJECT_INFO)
    sendObjInfo.setTransactionID(++this.transactionID)
    sendObjInfo.setTransactionType(MTP_PACKET_TYPE_COMMAND)
    sendObjInfo.setParams(storageObject.storageID, PLACE_IN_ROOT, 0, 0, 0)
    sendObjInfo.pack()
    await this.sendPacket(sendObjInfo.container_array)

    let fileInfo = new ObjectInfoDataset(storageObject.fileID)           // RDR this was originally hard coded as 0x01, this should be the FileID of the StorageObject
    fileInfo.initContainer(UNDEFINED_OBJECT_FORMAT, fileSize, 0, 0, filename)
    let sendObjInfo2 = new mtpPacket(0)
    sendObjInfo2.setOperation(SEND_OBJECT_INFO)
    sendObjInfo2.setTransactionID(this.transactionID)  // Same MTP Transaction as first packet
    sendObjInfo2.setParams(0, 0, 0, 0, 0)
    sendObjInfo2.setTransactionType(CONTAINER_TYPE_DATA)
    sendObjInfo2.containerArrayLength = (MTP_CONTAINER_ARRAY_LEN + fileInfo.container_array.length + fileInfo.filename_array.length + fileInfo.dateCreateLength.length + fileInfo.dateCreateArray.length + fileInfo.dateModLength.length + fileInfo.dateModArray.length + fileInfo.keywords.length)
    sendObjInfo2.pack()
    await this.sendPacket(new Uint8Array([...sendObjInfo2.container_array, ...fileInfo.container_array, ...fileInfo.filename_array, ...fileInfo.dateCreateLength, ...fileInfo.dateCreateArray, ...fileInfo.dateModLength, ...fileInfo.dateModArray, ...fileInfo.keywords]))
    return uploadFileInfoPromise
  }

  /*
   * @method  uploadFile
   * @brief   Upload a file to the device. NOTE: The SendObject operation requires completion of the SendObjectInfo operation.
   * 
   * Protocol:
   * H->D : Command #4: 0x100D, Upload File packet #1
   * 0000   1b 00 60 4a 45 29 89 dc ff ff 00 00 00 00 09 00   ..`JE)..........
   * 0010   00 01 00 24 00 01 03 0c 00 00 00 0c 00 00 00 01   ...$............
   * 0020   00 0d 10 0b 00 00 00                              .......
   * 
   * 
   * H->D : Command #5: 0x100D, Upload File packet #2
   * 0000   1b 00 60 7a 7a 1c 89 dc ff ff 00 00 00 00 09 00   ..`zz...........
   * 0010   00 01 00 24 00 01 03 3a 00 00 00 3a 00 00 00 02   ...$...:...:....
   * 0020   00 0d 10 0b 00 00 00 50 61 73 73 77 6f 72 64 3d   .......Password=
   * 0030   22 4c 65 6e 61 40 30 32 31 34 35 22 0d 0a 48 69   "XXXX@02145"..Hi
   * 0040   64 65 42 6f 6f 74 50 61 72 74 69 74 69 6f 6e 3d   deBootPartition=
   * 0050   22 4e 22 0d 0a                                    "N"..
   * 
   * Response:
   * 0000   1b 00 a0 c8 c1 2b 89 dc ff ff 00 00 00 00 09 00   .....+..........
   * 0010   01 01 00 24 00 81 03 24 00 00 00 18 00 00 00 03   ...$...$........
   * 0020   00 01 20 0a 00 00 00 00 00 00 00 00 00 00 00 02   .. .............
   * 0030   00 00 00 0c 00 00 00 03 00 01 20 0b 00 00 00      .......... ....
   * 
   */
  async uploadFile(fileBytes) {
    let device = this
    let result = device.receivePackets(device, 2)
    let uploadFilePromise = new Promise(function(resolve) {
      result.then((receivedPackets) => {

          device.logPacket("MTPDevice.uploadFile Resp:", receivedPackets[0])
          console.log("uploadFile transaction MTP  : ", device.transactionID, receivedPackets[0][8])

          device.logPacket("MTPDevice.uploadFile Resp:", receivedPackets[1])
          console.log("uploadFile transaction MTP  : ", device.transactionID, receivedPackets[1][8])


          if (((receivedPackets[0][7] << 8) | receivedPackets[0][6]) === MTP_OK) {
            resolve(true)
          } else {
            throw "File upload unsuccessful!"
          }
        })
        .catch((err) => {
          console.log("MTPDevice.uploadFile Error", err)
          resolve(false)
        })
    })
    // Send the file to the device using as many messages as necessary.
    let reqSendObject = new mtpPacket(0)
    reqSendObject.setTransactionType(MTP_PACKET_TYPE_COMMAND)
    reqSendObject.setTransactionID(++this.transactionID)
    reqSendObject.setOperation(SEND_OBJECT)
    reqSendObject.setParams(0, 0, 0, 0, 0)
    reqSendObject.pack()
    await this.sendPacket(reqSendObject.container_array)
    
    let reqSendObject2 = new mtpPacket(0)
    reqSendObject2.setOperation(SEND_OBJECT)
    reqSendObject2.setTransactionID(this.transactionID)  // Same MTP Transaction as first packet
    reqSendObject2.setParams(0, 0, 0, 0, 0)
    reqSendObject2.setTransactionType(CONTAINER_TYPE_DATA)
    reqSendObject2.containerArrayLength = (MTP_CONTAINER_ARRAY_LEN + fileBytes.length)
    reqSendObject2.pack()
    let end = 0
    let i = 0
    while (i < fileBytes.length) {
      if (i + MTP_PACKET_MAX_SIZE > fileBytes.length) {
        end = fileBytes.length
      } else {
        end = i + MTP_PACKET_MAX_SIZE
        if (i === 0) {
          end = i + 500
        }
      }
      let sliced = fileBytes.slice(i, end)
      if (i === 0) {
        let sendbuf = new Uint8Array([...reqSendObject2.container_array, ...sliced])
        await this.sendPacket(sendbuf)
      } else {
        await this.sendPacket(sliced)
      }
      i = end
    }
    return uploadFilePromise
  }


  async sendPacket(packet) {
    await this.sleep(10)
    await this.device.transferOut(this.endpointOut, packet)
    await this.sleep(10)
    
    this.logPacket("MTPDevice.sendPacket:", packet)
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  logPacket(label, packet) {
    let packetstr = ""
    packet.forEach(x => {packetstr += ("00" + x.toString(16)).toUpperCase().slice(-2) + " "})
    console.log(label, packetstr)
  }  
}

function bin2String(array) {
  let result = ""
  for (let i = 0; i < array.length; i += 1) {
    result += String.fromCharCode(array[i])
  }
  return result
}
