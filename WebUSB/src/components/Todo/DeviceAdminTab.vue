<template>
  <v-container class="ma-0 pa-5">
      <v-row>
        <v-col cols="auto">
            <v-text-field v-model="TpgDevice.config.HardwareVersion"
            label="Hardware Version"
            readonly
            filled
            >
            </v-text-field>
        </v-col>
        <v-col cols="auto">
            <v-text-field v-model="TpgDevice.config.FirmwareVersion"
            label="Firmware Version"
            readonly
            filled
            >
            </v-text-field>
        </v-col>
      </v-row>
      <v-row>
        <v-col cols="auto">
            <v-text-field v-model="TpgDevice.config.SerialNumber"
            label="Serial Number"
            filled
            >
            </v-text-field>
        </v-col>
        <v-col cols="auto">
            <v-text-field v-model="TpgDevice.config.DeviceCurrentTime"
            label="Device Time"
            filled
            >
            </v-text-field>
        </v-col>

      </v-row>
      <v-row>
        <v-col cols="auto">
            <v-text-field v-model="TpgDevice.config.RecordingDurationConfig"
            label="Recording Duration"
            filled
            >
            </v-text-field>
        </v-col>
        <v-col cols="auto">
            <v-text-field v-model="TpgDevice.config.RecordingMultidayConfig"
            label="Multi Day Config"
            filled
            >
            </v-text-field>
        </v-col>

      </v-row>
      <v-row>
        <v-col cols="auto">
            <v-text-field v-model="TpgDevice.config.AudioEncoding"
            label="Audio Encoding"
            filled
            >
            </v-text-field>
        </v-col>
        <v-col cols="auto">
            <v-text-field v-model="TpgDevice.config.AudioLength"
            label="Audio Length"
            readonly
            filled
            >
            </v-text-field>
        </v-col>
        <v-col cols="auto">
            <v-text-field v-model="TpgDevice.config.Gain"
            label="Gain"
            filled
            >
            </v-text-field>
        </v-col>
      </v-row>
      <v-row>
        <v-col cols="auto">
            <v-text-field v-model="TpgDevice.config.BatteryIsCharging"
            label="Battery Status"
            readonly
            filled
            >
            </v-text-field>
        </v-col>
        <v-col cols="auto">
            <v-text-field v-model="TpgDevice.config.BatteryAmperage"
            label="Battery Amperage"
            readonly
            filled
            >
            </v-text-field>
        </v-col>
        <v-col cols="auto">
            <v-text-field v-model="TpgDevice.config.BatteryVoltage"
            label="Battery Voltage"
            readonly
            filled
            >
            </v-text-field>
        </v-col>
      </v-row>
      <v-row>
        <v-textarea
        label="command.txt"
        :value="TpgDevice.config.commandText"
        rows="20"
        />
      </v-row>
  </v-container>
</template>

<script>
export default {
    props:['TpgDevice'],
}
</script>
