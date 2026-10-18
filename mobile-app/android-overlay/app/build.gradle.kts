import java.util.Properties

plugins {
    id("com.android.application")
    // Firebase configuration
    id("com.google.gms.google-services")
    // Flutter Gradle plugin
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing key (android/key.properties, never committed). Without it,
// release builds fall back to the debug key: fine for testing, not for Play.
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
val hasReleaseKey = keystorePropertiesFile.exists()
if (hasReleaseKey) keystorePropertiesFile.inputStream().use { keystoreProperties.load(it) }

android {
    namespace = "app.gymboo.gym_boo"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        // Required by flutter_local_notifications
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Version comes from pubspec.yaml (or --build-name / --build-number)
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // Two apps from one codebase: `flutter build ... --flavor admin|member`.
    // Dart reads the flavor through `appFlavor` (lib/config.dart).
    flavorDimensions += "app"
    productFlavors {
        create("admin") {
            dimension = "app"
            applicationId = "app.gymboo.gym_boo"
        }
        create("member") {
            dimension = "app"
            applicationId = "app.gymboo.member"
        }
    }

    signingConfigs {
        if (hasReleaseKey) {
            create("release") {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName(if (hasReleaseKey) "release" else "debug")
            // R8: strip unused Java/Kotlin code and unused resources.
            isMinifyEnabled = true
            isShrinkResources = true
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

flutter {
    source = "../.."
}
