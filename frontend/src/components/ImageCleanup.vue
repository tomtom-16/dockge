<template>
    <section class="shadow-box big-padding mt-4">
        <h2>{{ $t("imageCleanup") }}</h2>
        <template v-if="$root.agentCount > 1">
            <label for="cleanup-host" class="form-label">{{ $t("dockgeAgent") }}</label>
            <select id="cleanup-host" v-model="endpoint" class="form-select mb-3" :disabled="processing || preparing">
                <option v-for="(agent, key) in $root.agentList" :key="key" :value="key" :disabled="$root.agentStatusList[key] !== 'online'">
                    {{ agent.name || key || $t("Current") }}
                </option>
            </select>
        </template>
        <div class="form-check mb-3">
            <input id="cleanup-all" v-model="all" class="form-check-input" type="checkbox" :disabled="processing || preparing">
            <label for="cleanup-all" class="form-check-label">{{ $t("imageCleanupAll") }}</label>
        </div>
        <p v-if="all" class="text-warning">{{ $t("imageCleanupAllWarning") }}</p>
        <button class="btn btn-warning" :disabled="processing || preparing || !hostOnline" @click="preview">
            {{ $t(processing ? "imageCleanupRunning" : preparing ? "imageCleanupLoading" : "imageCleanupAction") }}
        </button>
        <p v-if="processing" class="mt-3" role="status">{{ $t("imageCleanupRunning") }} · {{ runningHost }}</p>
        <div v-if="result" class="mt-3" role="status">
            <p>{{ resultHost }}</p>
            <p :class="{ 'text-danger': failed }">{{ result }}</p>
            <ul v-if="resultImages.length" class="cleanup-output list-unstyled">
                <li v-for="label in imageLabels(resultImages)" :key="label">{{ label }}</li>
            </ul>
            <p v-if="reclaimedSpace">{{ $t("imageCleanupReclaimed", { size: reclaimedSpace }) }}</p>
        </div>
        <Confirm ref="confirm" :title="$t('imageCleanupAction')" :yes-text="$t('imageCleanupAction')" :no-text="$t('cancel')" :yes-disabled="preparing || !!previewError || !previewImages.length || !hostOnline || processing" btn-style="btn-warning" @yes="cleanup">
            <p v-if="preparing" role="status">{{ $t("imageCleanupLoading") }}</p>
            <p v-else-if="previewError" class="text-danger" role="alert">{{ previewError }}</p>
            <template v-else-if="previewImages.length">
                <p>{{ $t("imageCleanupPreview") }}</p>
                <ul class="cleanup-output list-unstyled">
                    <li v-for="label in imageLabels(previewImages)" :key="label">{{ label }}</li>
                </ul>
            </template>
            <p v-else>{{ $t("imageCleanupEmpty") }}</p>
        </Confirm>
    </section>
</template>

<script>
import Confirm from "./Confirm.vue";

export default {
    components: { Confirm },
    data() {
        return {
            endpoint: "",
            all: false,
            processing: false,
            preparing: false,
            previewImages: [],
            previewError: "",
            previewEndpoint: "",
            previewAll: false,
            resultImages: [],
            reclaimedSpace: "",
            result: "",
            failed: false,
            resultHost: "",
            runningHost: "",
        };
    },
    computed: {
        hostLabel() {
            return this.$root.agentList[this.endpoint]?.name || this.endpoint || this.$t("Current");
        },
        hostOnline() {
            return this.$root.agentStatusList[this.endpoint] === "online";
        },
    },
    methods: {
        /** Prefer repository tags, falling back to a short ID for untagged images. */
        imageLabels(images) {
            return images.flatMap(image => image.tags.length ? image.tags : [ image.id.replace(/^sha256:/, "").slice(0, 12) ]);
        },
        /** Load the selected host's images before enabling confirmation. */
        preview() {
            if (this.processing || this.preparing || !this.hostOnline) {
                return;
            }
            this.preparing = true;
            this.previewImages = [];
            this.previewError = "";
            this.previewEndpoint = this.endpoint;
            this.previewAll = this.all;
            this.$refs.confirm.show();
            this.$root.getSocket().timeout(60 * 1000).emit("agent", this.previewEndpoint, "previewImageCleanup", this.previewAll, (error, res) => {
                this.preparing = false;
                if (error || !res?.ok || !Array.isArray(res.images)) {
                    this.previewError = error ? this.$t("imageCleanupNoResponse") : res?.msg || this.$t("imageCleanupPreviewError");
                    return;
                }
                this.previewImages = res.images;
            });
        },
        /** Run the confirmed cleanup on exactly one authenticated endpoint. */
        cleanup() {
            if (this.processing || this.preparing || this.previewError || !this.previewImages.length || !this.hostOnline || this.endpoint !== this.previewEndpoint || this.all !== this.previewAll) {
                return;
            }
            this.processing = true;
            this.result = "";
            this.resultImages = [];
            this.reclaimedSpace = "";
            this.runningHost = this.hostLabel;
            this.$root.getSocket().timeout(16 * 60 * 1000).emit("agent", this.previewEndpoint, "pruneImages", this.previewAll, (error, res) => {
                this.processing = false;
                this.resultHost = this.runningHost;
                this.failed = Boolean(error) || !res?.ok;
                this.resultImages = !this.failed && Array.isArray(res.images) ? res.images : [];
                this.reclaimedSpace = !this.failed ? res.reclaimedSpace || "" : "";
                this.result = error ? this.$t("imageCleanupNoResponse") : this.failed ? res?.msg || this.$t("imageCleanupPreviewError") : this.$t(this.resultImages.length ? "imageCleanupDeleted" : "imageCleanupNoneDeleted");
            });
        },
    },
};
</script>

<style scoped>
.cleanup-output {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-height: 20rem;
    overflow-y: auto;
}
</style>
