<template>
  <v-container class="ma-0 pa-5">
    <v-textarea
      label="config.txt"
      :value="diagnosticText"
      rows="20"
      />
  </v-container>
</template>

<script>
export default {
    props: ['TpgDevice'],
    data: () => ({
      diagnosticText: null,
    }),
    mounted() {
      this.diagnosticText = JSON.stringify(this.TpgDevice,null, '\t')
    }
}
</script>

<style>
.v-textarea{
    font-size: .8em;
}
</style>