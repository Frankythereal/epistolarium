plugins {
    id("com.android.application")
}

android {
    namespace = "de.frankythereal.epistolarium"
    compileSdk = 35

    defaultConfig {
        applicationId = "de.frankythereal.epistolarium"
        minSdk = 26
        targetSdk = 35
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.0." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
    }

    signingConfigs {
        create("release") {
            storeFile = file("release.keystore")
            storePassword = "epistolarium"
            keyAlias = "epistolarium"
            keyPassword = "epistolarium"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
