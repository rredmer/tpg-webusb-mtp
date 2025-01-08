import Vue from 'vue'
import Vuex from 'vuex'
import Localbase from 'localbase'

import MTPDevice from './modules/mtpDriver'

let db = new Localbase('db')
db.config.debug = false

Vue.use(Vuex)

export default new Vuex.Store({
  state: {
    appTitle: process.env.VUE_APP_TITLE,
    search: null,
    TpgDevices: [
    ],
    snackbar: {
      show: false,
      text: ''
    },
    sorting: false
  },

  mutations: {

    addDevice(state, newDevice) {
      console.log("Store: mutations.AddDevice: ", newDevice)
      state.TpgDevices.push(newDevice)
    },
    deleteDevice(state, id) {
      console.log("Store: mutations.deleteDevice: ", id)
      state.TpgDevices = state.TpgDevices.filter(lenaDevice => lenaDevice.id !== id)
    },
    updateDevice(state, payload) {
      console.log("Store: mutations.updateDevice: ", payload.id)
      let device = state.TpgDevices.filter(device => device.id === payload.id)
      device.config = payload.config
    },
    setDevices(state, Devices) {
      console.log("Store: mutations.setDeviced: ", Devices)
      state.TpgDevices = Devices
    },
    
    showSnackbar(state, text) {
      let timeout = 0
      if (state.snackbar.show) {
        state.snackbar.show = false
        timeout = 300
      }
      setTimeout(() => {
        state.snackbar.show = true
        state.snackbar.text = text
      }, timeout)
    },
    hideSnackbar(state) {
      state.snackbar.show = false
    },
  },


  actions: {
    addDevice({ commit }, newDevice) {
      console.log("Store.actions.AddDevice: ", newDevice)
      newDevice.id = Date.now()

      db.collection('Devices').add(newDevice).then(() => {
        commit('addDevice', newDevice)
        commit('showSnackbar', 'Device added!')
      })
    },
    deleteDevice({ commit }, id) {
      console.log("Store.actions.deleteDevice: ", id)
      db.collection('Devices').doc({ id: id }).delete().then(() => {
        commit('deleteDevice', id)
        commit('showSnackbar', "Device removed!")
      })
    },
    deleteDeviceBySerialNumber({ commit }, serialNumber) {
      console.log("Store.actions.deleteDeviceBySerialNumber: ", serialNumber)
      let lenaIndex = this.state.TpgDevices.findIndex(element => { if (element.config.SerialNumber === serialNumber) { return true; }})
      db.collection('Devices').doc({ id: this.state.TpgDevices[lenaIndex].id }).delete().then(() => {
        commit('deleteDevice', this.state.TpgDevices[lenaIndex].id)
        commit('showSnackbar', "Device removed!")
      })
    },
    updateDevice({ commit }, payload) {
      console.log("Store.actions.updateDevice: ", payload)
      db.collection('Devices').doc({ id: payload.id }).update( {
        config: payload.config
      }).then(() => {
        commit('updateDevice', payload)
        commit('showSnackbar', "Device updated!")
      })
    },
    setDevices({ commit }, TpgDevices) {
      console.log("Store: SetDevices")
      db.collection('Devices').set(TpgDevices)
      commit('setDevices', TpgDevices)
    },
    getDevices({ commit }) {
      console.log("Store: GetDevices")
      db.collection('Devices').get().then(TpgDevices => {
        commit('setDevices', TpgDevices)
      })
    },
  },
   getters: {
    devicesFiltered(state) {
      return state.TpgDevices
    },
  },
  modules: {
    
  }
})
