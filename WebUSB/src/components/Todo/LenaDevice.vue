<template>
  <v-list-item>
    <v-card class="pt-3" width="100%">
      <v-toolbar color="deep-purple" dark>
        <v-toolbar-title class="deep-purple">Recorder S/N: {{TpgDevice.config.SerialNumber}}</v-toolbar-title>
      </v-toolbar>
      <v-tabs background-color="deep-purple" center-active dark>
        <v-tab>User</v-tab>
        <v-tab>Admin</v-tab>
        <v-tab>Diagnostic</v-tab>
        <v-tab-item>
          <device-user-tab v-bind:TpgDevice="TpgDevice" />
        </v-tab-item>
        <v-tab-item>
          <device-admin-tab v-bind:TpgDevice="TpgDevice" />
        </v-tab-item>
        <v-tab-item>
          <device-diagnostic-tab v-bind:TpgDevice="TpgDevice" />
        </v-tab-item>
      </v-tabs>
      <v-card-actions>
        <v-btn color="primary" @click="downloadAudioFileButton()"> Upload Audio </v-btn>
        <v-btn color="primary"> Delete Audio </v-btn>
        <v-btn color="primary" @click="OnUploadButton()"> Update Settings </v-btn>
        <v-btn color="primary"> Update Firmware </v-btn>
        <v-btn color="primary"> Restart </v-btn>
        <v-btn color="primary" @click="disconnectDevice()"> Eject </v-btn>
      </v-card-actions>
      <v-file-input v-model="file"
        label="Choose file"
        small-chips
        truncate-length="20"
        @change="loadCommandFile()"
      ></v-file-input>
    </v-card>
  </v-list-item>
</template>

<script>
import DeviceUserTab from "./DeviceUserTab.vue"
import DeviceAdminTab from "./DeviceAdminTab.vue"
import DeviceDiagnosticTab from './DeviceDiagnosticTab.vue'

export default {
  props: ["TpgDevice"],
  data: () => ({
    file: null,
  }),
  components: {
    DeviceUserTab,
    DeviceAdminTab,
    DeviceDiagnosticTab
  },
  methods: {
    async downloadAudioFileButton() {
      this.$parent.$parent.$parent.downloadAudioFile(this.TpgDevice)
    },
    async disconnectDevice() {
      this.$parent.$parent.$parent.disconnectDevice(this.TpgDevice)
    },
    loadCommandFile() {
      console.log(this.file)

      const reader = new FileReader()
      reader.readAsText(this.file, "UTF-8")

      reader.onload =  evt => {
        this.TpgDevice.config.commandFile = this.file
        this.TpgDevice.config.commandText = evt.target.result;
        // Update the $store
        
      }

    },
    async OnUploadButton() {
      this.$parent.$parent.$parent.uploadSettingsFile(this.TpgDevice)
    },
  }
};
</script>
