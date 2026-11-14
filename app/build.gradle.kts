plugins {
    id("com.android.application")
}

android {
    namespace = "dev.ds.compiler"
    compileSdk = 34

    defaultConfig {
        applicationId = "dev.ds.compiler"
        minSdk = 23
        targetSdk = 34
        versionCode = 2
        versionName = "0.2.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
