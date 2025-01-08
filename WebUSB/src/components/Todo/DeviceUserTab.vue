<template>
  <v-container class="ma-0 pa-5">
    <v-row>
      <v-col cols="auto">
        <v-progress-circular color="green" :size="100" :value="batteryLevel">{{batteryLevel}}%</v-progress-circular>
        <center><p class="caption">Battery</p></center>
      </v-col>
      <v-col cols="auto">
        <v-progress-circular color="green" :size="100" :value="audioLength"> {{TpgDevice.config.AudioLength}} </v-progress-circular>
        <center><p class="caption">Audio</p></center>
      </v-col>
    </v-row>
    <v-row>
      <p class="caption">Connected: {{TpgDevice.deviceConnected}}</p>
    </v-row>
    <v-row cols="auto">
      <v-col cols="9">
        <v-container v-if="(TpgDevice.audioCopyTimeStarted !== null)">
        <v-progress-linear color="blue-grey" height="25" :value="TpgDevice.audioCopyProgress">
          <template v-slot:default="{ value }">
            <strong>{{ Math.ceil(value) }}%</strong>
          </template>
        </v-progress-linear>
        <p class="caption">Upload Progress:   {{TpgDevice.audioCopyBytes.toLocaleString('en-US')}} of {{TpgDevice.audioCopyTotalBytes.toLocaleString('en-US')}} copied</p>
        <p class="caption">Upload Started:    {{TpgDevice.audioCopyTimeStarted}}</p>
        <p class="caption">Upload Completed:  {{TpgDevice.audioCopyTimeFinished}}</p>
        </v-container>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
export default {
    props: ["TpgDevice"],
    data: () => ({
          audioLength: 0,
          batteryLevel: 0,
      }),
    mounted() {
        this.audioLength = this.getAudioLength(),
        this.batteryLevel = this.getBatteryLevel()
    },
    methods: {
      getAudioLength() {
        let maxLength = Number(this.TpgDevice.config.RecordingDurationConfig)
        let length = Number(this.TpgDevice.config.AudioLength)
        return ((length / maxLength)*100)
      },
      getBatteryLevel() {
          if (this.TpgDevice.config.BatteryIsCharging = 'Charged') return(100)
          else {
              // Compute batery level using Amperage and Voltage properties
              return(50)
          }
      },
  }
};
</script>
